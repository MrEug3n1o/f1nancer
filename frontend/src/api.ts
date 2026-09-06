import { handleDelete, handleGet, handlePatch, handlePost } from "./data/repo";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

function isEnginePath(path: string): boolean {
  return (
    path.startsWith("/system") ||
    path.startsWith("/local-export") ||
    path.startsWith("/health")
  );
}

async function engineRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
    ...options,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail
        ? typeof body.detail === "string"
          ? body.detail
          : JSON.stringify(body.detail)
        : detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) =>
    isEnginePath(path) ? engineRequest<T>(path) : (handleGet(path) as Promise<T>),
  post: <T>(path: string, body: unknown) =>
    isEnginePath(path)
      ? engineRequest<T>(path, { method: "POST", body: JSON.stringify(body) })
      : (handlePost(path, body) as Promise<T>),
  patch: <T>(path: string, body: unknown) =>
    isEnginePath(path)
      ? engineRequest<T>(path, { method: "PATCH", body: JSON.stringify(body) })
      : (handlePatch(path, body) as Promise<T>),
  delete: (path: string) =>
    isEnginePath(path)
      ? engineRequest<void>(path, { method: "DELETE" })
      : handleDelete(path),
};
