import { ApiError, parseApiError } from "../lib/errors.js";

export type RequestOptions = {
  method?: string;
  body?: unknown;
  allowUnauthorized?: boolean;
};

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | undefined;

export function setUnauthorizedHandler(
  handler: UnauthorizedHandler | undefined,
): void {
  unauthorizedHandler = handler;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const init: RequestInit = {
    method: options.method ?? "GET",
    credentials: "include",
    headers,
  };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }
  const response = await fetch(path, init);

  let parsed: unknown = undefined;
  const text = await response.text();
  if (text !== "") {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      throw new ApiError(
        response.status,
        "INTERNAL_ERROR",
        "Relay returned an unexpected response.",
      );
    }
  }

  if (response.status === 401 && options.allowUnauthorized !== true) {
    unauthorizedHandler?.();
  }

  if (!response.ok) {
    throw parseApiError(response.status, parsed);
  }

  return parsed as T;
}
