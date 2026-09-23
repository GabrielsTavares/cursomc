import type {
  ApiErrorBody,
  ContentProject,
  CreateProjectRequest,
  CreateSocialAccountRequest,
  ProjectType,
  SocialAccount,
  UpdateSocialAccountRequest,
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
    return body?.message === "Unauthorized"
      ? "Sessão expirada ou sem permissão. Entre de novo."
      : "Email ou senha inválidos.";
  }
  if (status === 404) {
    return body?.message ?? "Recurso não encontrado.";
  }
  if (status === 400) {
    return body?.message ?? "Dados inválidos. Reveja o formulário.";
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

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
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
    throw new ApiClientError(
      humanizeError(res.status, errBody, false),
      res.status,
      errBody?.code,
    );
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

export async function createProject(input: CreateProjectRequest): Promise<ContentProject> {
  const result = await apiFetch<{ project: ContentProject }>("/api/v1/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.project;
}

export async function fetchProject(id: string): Promise<ContentProject> {
  const result = await apiFetch<{ project: ContentProject }>(`/api/v1/projects/${id}`);
  return result.project;
}

export async function deleteProject(id: string): Promise<void> {
  await apiFetch<null>(`/api/v1/projects/${id}`, { method: "DELETE" });
}

export async function fetchSocialAccounts(projectId: string): Promise<SocialAccount[]> {
  const result = await apiFetch<{ socialAccounts: SocialAccount[] }>(
    `/api/v1/projects/${projectId}/social-accounts`,
  );
  return result.socialAccounts;
}

export async function createSocialAccount(
  projectId: string,
  input: CreateSocialAccountRequest,
): Promise<SocialAccount> {
  const result = await apiFetch<{ socialAccount: SocialAccount }>(
    `/api/v1/projects/${projectId}/social-accounts`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return result.socialAccount;
}

export async function updateSocialAccount(
  projectId: string,
  accountId: string,
  input: UpdateSocialAccountRequest,
): Promise<SocialAccount> {
  const result = await apiFetch<{ socialAccount: SocialAccount }>(
    `/api/v1/projects/${projectId}/social-accounts/${accountId}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
  return result.socialAccount;
}

export async function deleteSocialAccount(
  projectId: string,
  accountId: string,
): Promise<void> {
  await apiFetch<null>(`/api/v1/projects/${projectId}/social-accounts/${accountId}`, {
    method: "DELETE",
  });
}

export const UI_PROJECT_TYPES: { value: ProjectType; label: string }[] = [
  { value: "CREATOR", label: "Creator" },
  { value: "AFFILIATE", label: "Affiliate" },
  { value: "BRAND", label: "Brand" },
  { value: "OTHER", label: "Other" },
];
