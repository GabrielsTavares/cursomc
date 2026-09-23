import type {
  ApiErrorBody,
  ContentProject,
  User,
} from "@creator-hub/shared-types";

/** Browser → API on host. Empty string uses same-origin / Vite proxy. */
const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);

const TOKEN_KEY = "creator_hub_access_token";

export type LoginSuccess = {
  user: User;
  accessToken: string;
};

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export function getStoredToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore private-mode storage failures */
  }
}

function humanizeError(status: number, body: ApiErrorBody | null, network: boolean): string {
  if (network) {
    return "Não foi possível contactar a API. Verifique se ela está no ar (porta 3000).";
  }
  if (status === 401) {
    return "Email ou senha inválidos.";
  }
  if (status === 400) {
    return body?.message ?? "Dados de login inválidos.";
  }
  if (status >= 500) {
    return "A API retornou um erro interno. Tente de novo em instantes.";
  }
  return body?.message ?? `Pedido falhou (${status}).`;
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = getStoredToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers,
      credentials: "include",
    });
  } catch {
    throw new ApiClientError(humanizeError(0, null, true), 0);
  }

  const data = await parseJson(res);
  if (!res.ok) {
    const errBody =
      data && typeof data === "object" && "message" in data
        ? (data as ApiErrorBody)
        : null;
    throw new ApiClientError(humanizeError(res.status, errBody, false), res.status, errBody?.code);
  }
  return data as T;
}

export function apiBaseUrl(): string {
  return API_URL || "(same origin)";
}

export async function login(email: string, password: string): Promise<LoginSuccess> {
  const result = await apiFetch<LoginSuccess>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setStoredToken(result.accessToken);
  return result;
}

export async function logout(): Promise<void> {
  try {
    await apiFetch<{ ok: boolean }>("/api/v1/auth/logout", { method: "POST" });
  } catch {
    /* still clear local session */
  } finally {
    setStoredToken(null);
  }
}

export async function fetchMe(): Promise<User> {
  const result = await apiFetch<{ user: User }>("/api/v1/auth/me");
  return result.user;
}

export async function fetchProjects(): Promise<ContentProject[]> {
  const result = await apiFetch<{ projects: ContentProject[] }>("/api/v1/projects");
  return result.projects;
}
