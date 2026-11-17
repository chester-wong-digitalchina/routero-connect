/** Non-secret validation errors: never include the supplied URL in an error. */
export class ApiRootError extends Error {
  constructor() {
    super("Use an HTTPS API root or its /v1 URL, without credentials, queries, fragments, or other paths.");
    this.name = "ApiRootError";
  }
}

export interface ApiEndpoints {
  readonly origin: string;
  readonly apiBase: string;
  readonly models: string;
  readonly responses: string;
  readonly chatCompletions: string;
}

/** Validate the original spelling before URL parsing can normalize unsafe paths. */
export function normalizeApiRoot(input: string): ApiEndpoints {
  const text = input.trim();
  if (/[\u0000-\u001f\u007f\\?#]|\bsk-/iu.test(input)) {
    throw new ApiRootError();
  }
  const parts = /^https:\/\/([^/]+)(.*)$/iu.exec(text);
  if (!parts || /[@\s]/u.test(parts[1]) || !["", "/", "/v1", "/v1/"].includes(parts[2])) {
    throw new ApiRootError();
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new ApiRootError();
  }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password || /\bsk-/iu.test(url.origin)) {
    throw new ApiRootError();
  }
  const apiBase = `${url.origin}/v1`;
  return Object.freeze({
    origin: url.origin,
    apiBase,
    models: `${apiBase}/models`,
    responses: `${apiBase}/responses`,
    chatCompletions: `${apiBase}/chat/completions`,
  });
}
