import type { AST } from "toml-eslint-parser" with { "resolution-mode": "import" };
import { ConfigError } from "./errors";
import { pathKey, type ManagedValue } from "./changes";

export interface Field {
  readonly path: readonly string[];
  readonly node: AST.TOMLKeyValue;
}
export interface Document {
  readonly text: string;
  readonly ast: AST.TOMLProgram;
  readonly fields: ReadonlyMap<string, Field>;
  readonly tables: ReadonlyMap<string, AST.TOMLTable>;
}

function keys(key: AST.TOMLKey): string[] {
  return key.keys.map((item) => item.type === "TOMLBare" ? item.name : item.value);
}

/** Do not materialize arbitrary TOML keys into JavaScript object properties. */
export async function parseDocument(text: string): Promise<Document> {
  try {
    const { parseTOML, traverseNodes } = await import("toml-eslint-parser");
    const bom = text.startsWith("\uFEFF");
    const ast = parseTOML(bom ? text.slice(1) : text, { tomlVersion: "1.0" });
    if (bom) {
      // Parser offsets refer to the BOM-free input; edits refer to original text.
      traverseNodes(ast, { enterNode(node) { node.range = [node.range[0] + 1, node.range[1] + 1]; }, leaveNode() {} });
      for (const item of [...ast.tokens, ...ast.comments]) { item.range = [item.range[0] + 1, item.range[1] + 1]; }
    }
    const fields = new Map<string, Field>();
    const tables = new Map<string, AST.TOMLTable>();
    const visit = (entry: AST.TOMLKeyValue, prefix: readonly string[]) => {
      const path = [...prefix, ...keys(entry.key)];
      fields.set(pathKey(path), { path, node: entry });
      if (entry.value.type === "TOMLInlineTable") {
        for (const child of entry.value.body) { visit(child, path); }
      }
    };
    for (const entry of ast.body[0].body) {
      if (entry.type === "TOMLKeyValue") { visit(entry, []); }
      else if (entry.kind === "standard" && entry.resolvedKey.every((part) => typeof part === "string")) {
        const prefix = entry.resolvedKey as string[];
        tables.set(pathKey(prefix), entry);
        for (const child of entry.body) { visit(child, prefix); }
      }
      // Arrays of tables remain untouched; incompatible managed paths fail below.
    }
    return { text, ast, fields, tables };
  } catch (error) {
    const candidate = error as { lineNumber?: unknown; column?: unknown };
    const location = typeof candidate?.lineNumber === "number" && typeof candidate.column === "number"
      ? { line: candidate.lineNumber, column: candidate.column } : undefined;
    throw new ConfigError("invalid-toml", location);
  }
}

function semantic(node: AST.TOMLContentNode): unknown {
  if (node.type === "TOMLArray") { return ["array", ...node.elements.map(semantic)]; }
  if (node.type === "TOMLInlineTable") {
    return ["table", ...node.body.map((entry) => [keys(entry.key), semantic(entry.value)]).sort((a, b) => JSON.stringify(a[0]).localeCompare(JSON.stringify(b[0])))];
  }
  if (node.kind === "integer") { return ["integer", node.bigint.toString()]; }
  if (node.kind === "float") { return ["float", String(node.value)]; }
  if (node.kind === "string" || node.kind === "boolean") { return [node.kind, node.value]; }
  return [node.kind, node.datetime];
}

export function fieldFingerprint(document: Document, path: readonly string[]): string | undefined {
  const field = document.fields.get(pathKey(path));
  return field ? JSON.stringify(semantic(field.node.value)) : undefined;
}

export function valueFingerprint(value: ManagedValue | undefined): string | undefined {
  if (value === undefined) { return undefined; }
  return JSON.stringify(Array.isArray(value) ? ["array", ...value.map((item) => ["string", item])] : [typeof value === "number" ? "integer" : typeof value, typeof value === "number" ? String(value) : value]);
}

export function renderValue(value: ManagedValue): string {
  // Basic TOML strings accept JSON escapes except \b/\f, which safe input excludes.
  return Array.isArray(value) ? `[${value.map((item) => JSON.stringify(item)).join(", ")}]` : JSON.stringify(value);
}

function lineEnd(text: string, offset: number): number {
  const newline = text.indexOf("\n", offset);
  return newline < 0 ? text.length : newline + 1;
}

/** Replace value spans only. New tables are appended; top-level fields go first. */
export async function editField(document: Document, path: readonly string[], rawValue: string | undefined): Promise<{ document: Document; createdTables: readonly (readonly string[])[] }> {
  const { text } = document;
  const field = document.fields.get(pathKey(path));
  let next: string;
  const createdTables: string[][] = [];
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  if (field) {
    if (rawValue === undefined) {
      if (field.node.parent.type === "TOMLInlineTable") { throw new ConfigError("unsupported-layout"); }
      // Keep indentation, trailing comments, and newline instead of deleting a line.
      next = text.slice(0, field.node.range[0]) + text.slice(field.node.range[1]);
    } else {
      next = text.slice(0, field.node.value.range[0]) + rawValue + text.slice(field.node.value.range[1]);
    }
  } else if (rawValue === undefined) {
    return { document, createdTables };
  } else {
    const parent = path.slice(0, -1);
    for (let length = 1; length < path.length; length++) {
      if (document.fields.has(pathKey(path.slice(0, length)))) { throw new ConfigError("unsupported-layout"); }
    }
    const assignment = `${JSON.stringify(path.at(-1))} = ${rawValue}${eol}`;
    if (parent.length === 0) {
      const offset = text.startsWith("\uFEFF") ? 1 : 0;
      next = text.slice(0, offset) + assignment + text.slice(offset);
    } else {
      const table = document.tables.get(pathKey(parent));
      if (table) {
        const offset = lineEnd(text, table.body.at(-1)?.range[1] ?? table.key.range[1]);
        const prefix = offset > 0 && text[offset - 1] !== "\n" ? eol : "";
        next = text.slice(0, offset) + prefix + assignment + text.slice(offset);
      } else {
        const prefix = text.length && !text.endsWith("\n") ? eol : "";
        const header = `[${parent.map((part) => JSON.stringify(part)).join(".")}]`;
        next = text + prefix + (text.length ? eol : "") + header + eol + assignment;
        createdTables.push([...parent]);
      }
    }
  }
  try {
    const parsed = await parseDocument(next);
    // A table/array/dotted-key collision must never masquerade as an absent field.
    if (rawValue !== undefined && !parsed.fields.has(pathKey(path))) { throw new Error(); }
    return { document: parsed, createdTables };
  } catch {
    throw new ConfigError("unsupported-layout");
  }
}

export function fieldRaw(document: Document, path: readonly string[]): string | undefined {
  const field = document.fields.get(pathKey(path));
  return field ? document.text.slice(...field.node.value.range) : undefined;
}

export async function pruneCreatedTables(document: Document, applied: Document, paths: readonly (readonly string[])[]): Promise<Document> {
  let current = document;
  for (const path of [...paths].sort((a, b) => b.length - a.length)) {
    const table = current.tables.get(pathKey(path));
    const original = applied.tables.get(pathKey(path));
    if (!table || !original || table.body.length || [...current.tables.values()].some((child) => child !== table && child.resolvedKey.length > path.length && path.every((part, index) => child.resolvedKey[index] === part))) { continue; }
    const end = current.text.indexOf("]", table.key.range[1]) + 1;
    const originalEnd = applied.text.indexOf("]", original.key.range[1]) + 1;
    if (current.text.slice(table.range[0], end) !== applied.text.slice(original.range[0], originalEnd)) { continue; }
    current = await parseDocument(current.text.slice(0, table.range[0]) + current.text.slice(end));
  }
  return current;
}
