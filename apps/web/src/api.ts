import type {
  ApiErrorBody,
  ContentKind,
  ContentProject,
  CreateEpisodeRequest,
  CreateProjectRequest,
  CreateScheduleRequest,
  CreateSocialAccountRequest,
  Episode,
  MediaAsset,
  ProjectType,
  ScheduledPublication,
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
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (init.body && !headers.has("Content-Type") && !isFormData) {
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

export async function fetchEpisodes(projectId: string): Promise<Episode[]> {
  const result = await apiFetch<{ episodes: Episode[] }>(
    `/api/v1/projects/${projectId}/episodes`,
  );
  return result.episodes;
}

export async function createEpisode(
  projectId: string,
  input: CreateEpisodeRequest,
): Promise<Episode> {
  const result = await apiFetch<{ episode: Episode }>(
    `/api/v1/projects/${projectId}/episodes`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return result.episode;
}

export async function deleteEpisode(projectId: string, episodeId: string): Promise<void> {
  await apiFetch<null>(`/api/v1/projects/${projectId}/episodes/${episodeId}`, {
    method: "DELETE",
  });
}

export async function fetchEpisodeMedia(
  projectId: string,
  episodeId: string,
): Promise<MediaAsset[]> {
  const result = await apiFetch<{ media: MediaAsset[] }>(
    `/api/v1/projects/${projectId}/episodes/${episodeId}/media`,
  );
  return result.media;
}

export async function fetchProjectMedia(projectId: string): Promise<MediaAsset[]> {
  const result = await apiFetch<{ media: MediaAsset[] }>(
    `/api/v1/projects/${projectId}/media`,
  );
  return result.media;
}

export async function uploadEpisodeMedia(
  projectId: string,
  episodeId: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<MediaAsset> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `${API_URL}/api/v1/projects/${projectId}/episodes/${episodeId}/media`;
    xhr.open("POST", url);
    xhr.withCredentials = true;
    const token = getStoredToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      let data: unknown = null;
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        data = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        const body = data as { media: MediaAsset };
        resolve(body.media);
        return;
      }
      const errBody =
        data && typeof data === "object" && "message" in data
          ? (data as ApiErrorBody)
          : null;
      reject(
        new ApiClientError(
          humanizeError(xhr.status, errBody, false),
          xhr.status,
          errBody?.code,
        ),
      );
    };

    xhr.onerror = () => {
      reject(new ApiClientError(humanizeError(0, null, true), 0));
    };

    const form = new FormData();
    form.append("file", file, file.name);
    xhr.send(form);
  });
}

export async function deleteMediaAsset(projectId: string, mediaId: string): Promise<void> {
  await apiFetch<null>(`/api/v1/projects/${projectId}/media/${mediaId}`, {
    method: "DELETE",
  });
}

export async function fetchPublications(projectId: string): Promise<ScheduledPublication[]> {
  const result = await apiFetch<{ publications: ScheduledPublication[] }>(
    `/api/v1/projects/${projectId}/publications`,
  );
  return result.publications;
}

export async function createSchedule(
  projectId: string,
  input: CreateScheduleRequest,
): Promise<ScheduledPublication[]> {
  const result = await apiFetch<{ publications: ScheduledPublication[] }>(
    `/api/v1/projects/${projectId}/publications`,
    { method: "POST", body: JSON.stringify(input) },
  );
  return result.publications;
}

export async function cancelPublication(
  projectId: string,
  publicationId: string,
): Promise<ScheduledPublication> {
  const result = await apiFetch<{ publication: ScheduledPublication }>(
    `/api/v1/projects/${projectId}/publications/${publicationId}/cancel`,
    { method: "POST" },
  );
  return result.publication;
}

export async function retryPublication(
  projectId: string,
  publicationId: string,
): Promise<ScheduledPublication> {
  const result = await apiFetch<{ publication: ScheduledPublication }>(
    `/api/v1/projects/${projectId}/publications/${publicationId}/retry`,
    { method: "POST" },
  );
  return result.publication;
}

export async function publishNow(
  projectId: string,
  publicationId: string,
): Promise<ScheduledPublication> {
  const result = await apiFetch<{ publication: ScheduledPublication }>(
    `/api/v1/projects/${projectId}/publications/${publicationId}/publish-now`,
    { method: "POST" },
  );
  return result.publication;
}

export async function markPublished(
  projectId: string,
  publicationId: string,
  externalPostId?: string,
): Promise<ScheduledPublication> {
  const result = await apiFetch<{ publication: ScheduledPublication }>(
    `/api/v1/projects/${projectId}/publications/${publicationId}/mark-published`,
    {
      method: "POST",
      body: JSON.stringify(externalPostId ? { externalPostId } : {}),
    },
  );
  return result.publication;
}

/** Authenticated blob URL for 9:16 preview (revoke when done). */
export async function fetchMediaBlobUrl(downloadUrl: string): Promise<string> {
  const headers = new Headers();
  const token = getStoredToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${downloadUrl}`, {
      headers,
      credentials: "include",
    });
  } catch {
    throw new ApiClientError(humanizeError(0, null, true), 0);
  }
  if (!res.ok) {
    throw new ApiClientError("Não foi possível carregar a pré-visualização.", res.status);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export const UI_PROJECT_TYPES: { value: ProjectType; label: string }[] = [
  { value: "CREATOR", label: "Creator" },
  { value: "AFFILIATE", label: "Affiliate" },
  { value: "BRAND", label: "Brand" },
  { value: "OTHER", label: "Other" },
];

export const UI_CONTENT_KINDS: { value: ContentKind; label: string; hint: string }[] = [
  { value: "VIDEO", label: "Vídeo único", hint: "Um ficheiro mp4 ou webm" },
  { value: "IMAGE", label: "Foto", hint: "Uma imagem jpg, png ou webp" },
  { value: "CAROUSEL", label: "Carrossel", hint: "Sequência ordenada de imagens" },
];
