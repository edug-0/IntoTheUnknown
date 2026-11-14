// Client for the backend contract in docs/PLAN.md section 4.3. No mock data here.
import type { Health, ViewCreated, ViewRequest, ViewStatus } from "./types";

export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

export class ApiRequestError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let code = `HTTP_${res.status}`;
    let message = `The server answered ${res.status}.`;
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } };
      if (body.error?.code) code = body.error.code;
      if (body.error?.message) message = body.error.message;
    } catch {
      // Body was not JSON; keep the status message.
    }
    throw new ApiRequestError(code, message);
  }
  return (await res.json()) as T;
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(`${API_BASE}${path}`, init);
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiRequestError("NETWORK", "Could not reach the server. Check your connection and try again.");
  }
}

export function getHealth(signal?: AbortSignal): Promise<Health> {
  return request("/api/health", { signal }).then((r) => json<Health>(r));
}

export function createView(body: ViewRequest, signal?: AbortSignal): Promise<ViewCreated> {
  return request("/api/views", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  }).then((r) => json<ViewCreated>(r));
}

export function getViewStatus(statusUrl: string, signal?: AbortSignal): Promise<ViewStatus> {
  return request(statusUrl, { signal }).then((r) => json<ViewStatus>(r));
}

/** Fetch an absolute or API-relative URL (manifests and arrays live in Blob or /golden). */
export async function fetchAsset(url: string, signal?: AbortSignal): Promise<Response> {
  const full = /^https?:/.test(url) || url.startsWith("/golden/") ? url : `${API_BASE}${url}`;
  let res: Response;
  try {
    res = await fetch(full, { signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiRequestError("NETWORK", "Could not download the images. Check your connection and try again.");
  }
  if (!res.ok) throw new ApiRequestError(`HTTP_${res.status}`, `An image file is missing (${res.status}).`);
  return res;
}
