import type {
  AuthResponse,
  CreateItemInput,
  Credentials,
  Item,
  SyncRequest,
  SyncResponse,
  TagCount,
} from "./schemas";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ClientOptions = {
  /** "" on the web (same origin); the deployed URL on mobile. */
  baseUrl: string;
  /** Mobile sends a bearer token; the web relies on an httpOnly cookie instead. */
  getToken?: () => Promise<string | null> | string | null;
  credentials?: RequestCredentials;
};

/** One typed client used by both the Next.js dashboard and the Expo app. */
export function createApiClient({ baseUrl, getToken, credentials }: ClientOptions) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body !== undefined) headers.set("Content-Type", "application/json");
    const token = getToken ? await getToken() : null;
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const res = await fetch(`${baseUrl}${path}`, { ...init, headers, credentials });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const message =
        body && typeof body === "object" && "error" in body && typeof body.error === "string"
          ? body.error
          : `Request failed (${res.status})`;
      throw new ApiError(res.status, message);
    }
    return body as T;
  }

  const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

  return {
    register: (c: Credentials) => request<AuthResponse>("/api/auth/register", post(c)),
    login: (c: Credentials) => request<AuthResponse>("/api/auth/login", post(c)),
    logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),

    listItems: (params: { q?: string; tag?: string } = {}) => {
      const search = new URLSearchParams();
      if (params.q) search.set("q", params.q);
      if (params.tag) search.set("tag", params.tag);
      const qs = search.toString();
      return request<{ items: Item[] }>(`/api/items${qs ? `?${qs}` : ""}`);
    },
    createItem: (input: CreateItemInput) => request<{ item: Item }>("/api/items", post(input)),
    deleteItem: (id: string) =>
      request<{ ok: true }>(`/api/items/${encodeURIComponent(id)}`, { method: "DELETE" }),
    tags: () => request<{ tags: TagCount[] }>("/api/tags"),

    sync: (req: SyncRequest) => request<SyncResponse>("/api/sync", post(req)),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
