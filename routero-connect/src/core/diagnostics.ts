export type DiagnosticCategory = "configuration" | "connectivity" | "model-list" | "protocol" | "real-client";
export type DiagnosticOutcome = "passed" | "warning" | "failed" | "not-run";

export interface Diagnostic {
  readonly category: DiagnosticCategory;
  readonly outcome: DiagnosticOutcome;
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}

/** Defense in depth, not a license to log raw headers, requests, or errors. */
export function redactText(text: string, secrets: readonly string[] = []): string {
  let result = text;
  for (const secret of [...secrets].filter(Boolean).sort((a, b) => b.length - a.length)) {
    result = result.split(secret).join("[REDACTED]");
  }
  result = result.replace(/https?:\/\/[^\s"'<>]+/giu, (candidate) => {
    try {
      const url = new URL(candidate);
      if (url.username || url.password) {
        return "[REDACTED URL]";
      }
      if (url.search || url.hash) {
        return `${url.origin}${url.pathname}?[REDACTED]`;
      }
      return candidate;
    } catch {
      return "[REDACTED URL]";
    }
  });
  return result
    .replace(/\bAuthorization\s*[:=]\s*(?:Basic|Bearer)\s+[^\s"',;<>]+/giu, "Authorization: [REDACTED]")
    .replace(/\b(api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/giu, "$1=[REDACTED]")
    .replace(/\bBearer\s+[^\s"',;<>]+/giu, "Bearer [REDACTED]")
    .replace(/\bsk-[a-z0-9_-]+/giu, "[REDACTED]");
}

export function redactDetails(value: unknown, secrets: readonly string[] = [], maxStringLength = 2000): unknown {
  const seen = new WeakSet<object>();
  const visit = (item: unknown, depth: number): unknown => {
    if (typeof item === "string") {
      return redactText(item, secrets).slice(0, maxStringLength);
    }
    if (item === null || typeof item === "boolean" || typeof item === "number") {
      return item;
    }
    if (typeof item !== "object") {
      return "[OMITTED]";
    }
    if (depth > 8 || seen.has(item)) {
      return "[OMITTED]";
    }
    seen.add(item);
    if (Array.isArray(item)) {
      return item.slice(0, 50).map((entry) => visit(entry, depth + 1));
    }
    return Object.fromEntries(Object.entries(item).slice(0, 50).map(([key, entry]) => [
      redactText(key, secrets),
      /authorization|api.?key|token|password|secret|cookie/iu.test(key)
        ? "[REDACTED]" : visit(entry, depth + 1),
    ]));
  };
  return visit(value, 0);
}

export function createDiagnostic(input: Diagnostic, secrets: readonly string[] = []): Diagnostic {
  return Object.freeze({
    category: input.category,
    outcome: input.outcome,
    code: redactText(input.code, secrets),
    message: redactText(input.message, secrets),
    ...(input.details === undefined ? {} : { details: redactDetails(input.details, secrets) }),
  });
}

export function httpDiagnostic(status: number, reason?: "rate-limit" | "budget-limit"): Diagnostic {
  if (status < 400 || status > 599) {
    return createDiagnostic({ category: "connectivity", outcome: "not-run", code: "response-not-validated", message: "An HTTP status alone does not establish protocol or client compatibility." });
  }
  let code = "request-rejected";
  let message = "The request was rejected. Inspect sanitized backend reason information before assigning a cause.";
  if (status === 401) {
    code = "authentication";
    message = "The key is invalid, expired, or missing. Check or replace it.";
  } else if (status === 403) {
    code = "access-denied";
    message = "Access was denied. Check route/model permissions and whether an upstream service blocked the request.";
  } else if (status === 404) {
    code = "route-or-model";
    message = "Check the API path, deployed route, and model availability.";
  } else if (status === 429) {
    code = reason ?? "limit-unknown";
    message = reason === "rate-limit" ? "The backend reported a rate limit. Follow its retry guidance."
      : reason === "budget-limit" ? "The backend reported a budget limit. Check the account budget."
        : "A limit was reached; the response does not establish whether it is a rate or budget limit.";
  } else if (status >= 500 && status <= 599) {
    code = "server-failure";
    message = "The gateway or upstream service failed. Preserve sanitized request information for investigation.";
  }
  return createDiagnostic({ category: "connectivity", outcome: "failed", code, message });
}

export function transportDiagnostic(reason: "network" | "tls" | "timeout" | "cancelled"): Diagnostic {
  const messages = {
    network: "The connection failed. Check network reachability.",
    tls: "The secure connection failed. Check certificates; keep TLS verification enabled.",
    timeout: "The request timed out. Do not automatically replay a partially completed request.",
    cancelled: "The request was cancelled. Do not retry it automatically.",
  } as const;
  return createDiagnostic({ category: "connectivity", outcome: "failed", code: reason, message: messages[reason] });
}
