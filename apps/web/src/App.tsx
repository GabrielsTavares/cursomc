import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import type {
  ContentKind,
  ContentProject,
  Episode,
  MediaAsset,
  ProjectType,
  PublicationStatus,
  ScheduledPublication,
  SocialAccount,
  SocialAccountStatus,
  SocialCredentialsInput,
  SocialPlatform,
  User,
} from "@creator-hub/shared-types";
import {
  ApiClientError,
  UI_CONTENT_KINDS,
  UI_PROJECT_TYPES,
  apiBaseUrl,
  cancelPublication,
  createEpisode,
  createProject,
  createSchedule,
  createSocialAccount,
  deleteEpisode,
  deleteMediaAsset,
  deleteProject,
  deleteSocialAccount,
  fetchEpisodeMedia,
  fetchEpisodes,
  fetchMe,
  fetchMediaBlobUrl,
  fetchProject,
  fetchProjectMedia,
  fetchProjects,
  fetchPublications,
  fetchSocialAccounts,
  login,
  logout,
  markPublished,
  publishNow,
  retryPublication,
  updateSocialAccount,
  uploadEpisodeMedia,
} from "./api";

type ProjectTab = "overview" | "content" | "social" | "library" | "calendar";

type Session = {
  user: User;
  projects: ContentProject[];
};

type BootState = "loading" | "guest" | "ready";
type View = { name: "dashboard" } | { name: "project"; projectId: string };

type CredentialFieldKey = keyof SocialCredentialsInput;

const PLATFORMS: { value: SocialPlatform; label: string }[] = [
  { value: "TIKTOK", label: "TikTok" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "YOUTUBE", label: "YouTube" },
  { value: "KWAI", label: "Kwai" },
  { value: "FACEBOOK", label: "Facebook" },
  { value: "OTHER", label: "Outra" },
];

const PLATFORM_FIELDS: Record<
  SocialPlatform,
  { key: CredentialFieldKey; label: string; hint?: string }[]
> = {
  TIKTOK: [
    { key: "accessToken", label: "Access token" },
    { key: "refreshToken", label: "Refresh token" },
    { key: "clientId", label: "Client key / Client ID" },
    { key: "clientSecret", label: "Client secret" },
  ],
  INSTAGRAM: [
    { key: "accessToken", label: "Access token" },
    { key: "refreshToken", label: "Refresh token" },
    { key: "clientId", label: "App ID / Client ID" },
    { key: "clientSecret", label: "App secret" },
  ],
  YOUTUBE: [
    { key: "accessToken", label: "Access token (OAuth)" },
    { key: "refreshToken", label: "Refresh token" },
    { key: "clientId", label: "OAuth Client ID" },
    { key: "clientSecret", label: "OAuth Client secret" },
    { key: "apiKey", label: "API key (opcional)" },
  ],
  KWAI: [
    { key: "accessToken", label: "Access token / session" },
    { key: "apiKey", label: "API key" },
    { key: "extraJson", label: "Extra (JSON)", hint: "Campos adicionais em JSON" },
  ],
  FACEBOOK: [
    { key: "accessToken", label: "Page / user access token" },
    { key: "refreshToken", label: "Refresh token" },
    { key: "clientId", label: "App ID" },
    { key: "clientSecret", label: "App secret" },
  ],
  OTHER: [
    { key: "accessToken", label: "Access token" },
    { key: "apiKey", label: "API key" },
    { key: "clientId", label: "Client ID" },
    { key: "clientSecret", label: "Client secret" },
    { key: "extraJson", label: "Extra (JSON)" },
  ],
};

const STATUS_LABEL: Record<SocialAccountStatus, string> = {
  CONNECTED: "Ligado",
  NEEDS_CREDENTIALS: "Faltam credenciais",
  MANUAL: "Manual",
};

function errMessage(err: unknown, fallback: string): string {
  return err instanceof ApiClientError ? err.message : fallback;
}

function emptyCreds(): SocialCredentialsInput {
  return {
    accessToken: "",
    refreshToken: "",
    clientId: "",
    clientSecret: "",
    apiKey: "",
    extraJson: "",
  };
}

function pickFilledCredentials(form: SocialCredentialsInput): SocialCredentialsInput | undefined {
  const out: SocialCredentialsInput = {};
  for (const key of Object.keys(form) as CredentialFieldKey[]) {
    const value = form[key]?.trim();
    if (value) out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

export function App() {
  const [boot, setBoot] = useState<BootState>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<View>({ name: "dashboard" });
  const [email, setEmail] = useState("admin@creator.local");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      try {
        const [user, projects] = await Promise.all([fetchMe(), fetchProjects()]);
        if (!cancelled) {
          setSession({ user, projects });
          setBoot("ready");
        }
      } catch {
        if (!cancelled) {
          setSession(null);
          setBoot("guest");
        }
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshProjects(): Promise<ContentProject[]> {
    const projects = await fetchProjects();
    setSession((prev) => (prev ? { ...prev, projects } : prev));
    return projects;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { user } = await login(email.trim(), password);
      const projects = await fetchProjects();
      setSession({ user, projects });
      setBoot("ready");
      setView({ name: "dashboard" });
      setPassword("");
    } catch (err) {
      setError(errMessage(err, "Falha inesperada ao entrar."));
    } finally {
      setSubmitting(false);
    }
  }

  async function onLogout() {
    setError(null);
    setSubmitting(true);
    try {
      await logout();
      setSession(null);
      setBoot("guest");
      setView({ name: "dashboard" });
    } finally {
      setSubmitting(false);
    }
  }

  if (boot === "loading") {
    return (
      <main className="page">
        <p className="brand">Creator Hub</p>
        <p className="lede">A restaurar sessão…</p>
      </main>
    );
  }

  if (boot === "ready" && session) {
    if (view.name === "project") {
      return (
        <ProjectDetail
          user={session.user}
          projectId={view.projectId}
          submitting={submitting}
          setSubmitting={setSubmitting}
          onBack={() => {
            setError(null);
            setView({ name: "dashboard" });
            void refreshProjects();
          }}
          onLogout={onLogout}
          onDeleted={async () => {
            await refreshProjects();
            setView({ name: "dashboard" });
          }}
        />
      );
    }

    return (
      <Dashboard
        session={session}
        submitting={submitting}
        setSubmitting={setSubmitting}
        error={error}
        setError={setError}
        onLogout={onLogout}
        onCreated={async (project) => {
          await refreshProjects();
          setView({ name: "project", projectId: project.id });
        }}
        onOpen={(projectId) => {
          setError(null);
          setView({ name: "project", projectId });
        }}
      />
    );
  }

  return (
    <main className="page page--narrow">
      <p className="brand">Creator Hub</p>
      <h1>Entrar</h1>
      <p className="lede">Phase 1 — login na API em {apiBaseUrl()}.</p>

      <form className="stack-form" onSubmit={onSubmit} noValidate>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
          />
        </label>
        <label className="field">
          <span>Senha</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
          />
        </label>

        {error && (
          <p className="bad" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn" disabled={submitting}>
          {submitting ? "A entrar…" : "Entrar"}
        </button>
      </form>

      <p className="hint">
        Seed local: <code>admin@creator.local</code> / <code>changeme123</code>
      </p>
    </main>
  );
}

function Dashboard(props: {
  session: Session;
  submitting: boolean;
  setSubmitting: (v: boolean) => void;
  error: string | null;
  setError: (v: string | null) => void;
  onLogout: () => void;
  onCreated: (project: ContentProject) => Promise<void>;
  onOpen: (projectId: string) => void;
}) {
  const { session, submitting, setSubmitting, error, setError, onLogout, onCreated, onOpen } =
    props;
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [projectType, setProjectType] = useState<ProjectType>("CREATOR");

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const project = await createProject({
        name: name.trim(),
        projectType,
      });
      setName("");
      setProjectType("CREATOR");
      setShowCreate(false);
      await onCreated(project);
    } catch (err) {
      setError(errMessage(err, "Não foi possível criar o projeto."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page page--wide">
      <header className="top">
        <p className="brand brand--compact">Creator Hub</p>
        <button type="button" className="btn btn--ghost" onClick={onLogout} disabled={submitting}>
          Sair
        </button>
      </header>
      <h1>Olá, {session.user.displayName}</h1>
      <p className="lede">Os teus projetos — abre um para vincular redes sociais.</p>

      <section className="section" aria-labelledby="projects-heading">
        <div className="section-head">
          <h2 id="projects-heading">Projetos</h2>
          <button
            type="button"
            className="btn"
            disabled={submitting}
            onClick={() => {
              setError(null);
              setShowCreate((v) => !v);
            }}
          >
            {showCreate ? "Cancelar" : "Novo projeto"}
          </button>
        </div>

        {showCreate && (
          <form className="stack-form stack-form--inset" onSubmit={onCreate}>
            <label className="field">
              <span>Nome</span>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Canal principal"
                disabled={submitting}
                autoFocus
              />
            </label>
            <label className="field">
              <span>Tipo</span>
              <select
                value={projectType}
                onChange={(e) => setProjectType(e.target.value as ProjectType)}
                disabled={submitting}
              >
                {UI_PROJECT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn" disabled={submitting || !name.trim()}>
              {submitting ? "A criar…" : "Criar projeto"}
            </button>
          </form>
        )}

        {error && (
          <p className="bad" role="alert">
            {error}
          </p>
        )}

        {session.projects.length === 0 ? (
          <p className="muted empty">
            Ainda não há projetos. Cria o primeiro com <strong>Novo projeto</strong>.
          </p>
        ) : (
          <ul className="project-list">
            {session.projects.map((project) => (
              <li key={project.id}>
                <button
                  type="button"
                  className="project-row"
                  onClick={() => onOpen(project.id)}
                  disabled={submitting}
                >
                  <span className="project-name">{project.name}</span>
                  <span className="project-meta">{project.projectType}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function ProjectDetail(props: {
  user: User;
  projectId: string;
  submitting: boolean;
  setSubmitting: (v: boolean) => void;
  onBack: () => void;
  onLogout: () => void;
  onDeleted: () => Promise<void>;
}) {
  const { projectId, submitting, setSubmitting, onBack, onLogout, onDeleted } = props;
  const [project, setProject] = useState<ContentProject | null>(null);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [library, setLibrary] = useState<MediaAsset[]>([]);
  const [publications, setPublications] = useState<ScheduledPublication[]>([]);
  const [tab, setTab] = useState<ProjectTab>("content");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showLink, setShowLink] = useState(false);
  const [editing, setEditing] = useState<SocialAccount | null>(null);
  const [showNewContent, setShowNewContent] = useState(false);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);
  const [episodeMedia, setEpisodeMedia] = useState<MediaAsset[]>([]);

  async function reload() {
    const [p, list, eps, media, pubs] = await Promise.all([
      fetchProject(projectId),
      fetchSocialAccounts(projectId),
      fetchEpisodes(projectId),
      fetchProjectMedia(projectId),
      fetchPublications(projectId),
    ]);
    setProject(p);
    setAccounts(list);
    setEpisodes(eps);
    setLibrary(media);
    setPublications(pubs);
  }

  async function reloadEpisodeMedia(episodeId: string) {
    const media = await fetchEpisodeMedia(projectId, episodeId);
    setEpisodeMedia(media);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await reload();
      } catch (err) {
        if (!cancelled) {
          setLoadError(errMessage(err, "Não foi possível carregar o projeto."));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (!selectedEpisodeId) {
      setEpisodeMedia([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const media = await fetchEpisodeMedia(projectId, selectedEpisodeId);
        if (!cancelled) setEpisodeMedia(media);
      } catch (err) {
        if (!cancelled) {
          setFormError(errMessage(err, "Não foi possível carregar a mídia deste conteúdo."));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, selectedEpisodeId]);

  async function onDeleteProject() {
    if (!project) return;
    if (
      !window.confirm(
        `Apagar o projeto “${project.name}”? Isto remove contas sociais, conteúdo e mídia.`,
      )
    ) {
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      await deleteProject(project.id);
      await onDeleted();
    } catch (err) {
      setFormError(errMessage(err, "Não foi possível apagar o projeto."));
    } finally {
      setSubmitting(false);
    }
  }

  async function onDeleteAccount(account: SocialAccount) {
    if (!window.confirm(`Remover a conta ${account.displayName} (${account.platform})?`)) {
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      await deleteSocialAccount(projectId, account.id);
      await reload();
      if (editing?.id === account.id) setEditing(null);
    } catch (err) {
      setFormError(errMessage(err, "Não foi possível remover a conta."));
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <main className="page page--wide">
        <p className="bad" role="alert">
          {loadError}
        </p>
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          Voltar aos projetos
        </button>
      </main>
    );
  }

  if (!project) {
    return (
      <main className="page page--wide">
        <p className="lede">A carregar projeto…</p>
      </main>
    );
  }

  const selectedEpisode = episodes.find((e) => e.id === selectedEpisodeId) ?? null;

  return (
    <main className="page page--wide page--project">
      <header className="top">
        <div className="top-left">
          <button type="button" className="btn btn--ghost" onClick={onBack} disabled={submitting}>
            ← Projetos
          </button>
          <p className="brand brand--compact">Creator Hub</p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={onLogout} disabled={submitting}>
          Sair
        </button>
      </header>

      <h1>{project.name}</h1>
      <p className="lede">
        Tipo <strong>{project.projectType}</strong> · locale {project.localeDefault}
      </p>

      <nav className="tabs" aria-label="Secções do projeto">
        {(
          [
            ["content", "Conteúdo"],
            ["calendar", "Calendário"],
            ["library", "Biblioteca"],
            ["social", "Contas sociais"],
            ["overview", "Overview"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`tabs__btn${tab === id ? " tabs__btn--active" : ""}`}
            onClick={() => {
              setTab(id);
              setFormError(null);
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      {formError && (
        <p className="bad" role="alert">
          {formError}
        </p>
      )}

      {tab === "overview" && (
        <section className="section" aria-labelledby="overview-heading">
          <div className="section-head">
            <h2 id="overview-heading">Overview</h2>
            <button
              type="button"
              className="btn btn--danger-ghost"
              onClick={onDeleteProject}
              disabled={submitting}
            >
              Apagar projeto
            </button>
          </div>
          <p className="muted">
            Fluxo: cria conteúdo → upload → agenda nas redes → o scheduler publica (ou Kwai
            fica MANUAL). Tokens ficam só no servidor; `PUBLISH_MODE=dry_run` simula sem rede.
          </p>
          <ul className="stat-inline muted">
            <li>{episodes.length} conteúdos</li>
            <li>{library.length} assets na biblioteca</li>
            <li>{accounts.length} redes</li>
            <li>{publications.length} agendamentos</li>
          </ul>
        </section>
      )}

      {tab === "content" && (
        <ContentSection
          projectId={projectId}
          episodes={episodes}
          selectedEpisode={selectedEpisode}
          episodeMedia={episodeMedia}
          showNewContent={showNewContent}
          submitting={submitting}
          setSubmitting={setSubmitting}
          onToggleNew={() => {
            setFormError(null);
            setShowNewContent((v) => !v);
          }}
          onSelectEpisode={(id) => {
            setSelectedEpisodeId(id);
            setFormError(null);
          }}
          onCreated={async (ep) => {
            setShowNewContent(false);
            await reload();
            setSelectedEpisodeId(ep.id);
          }}
          onDeleted={async () => {
            setSelectedEpisodeId(null);
            await reload();
          }}
          onMediaChanged={async () => {
            await reload();
            if (selectedEpisodeId) await reloadEpisodeMedia(selectedEpisodeId);
          }}
          onError={(msg) => setFormError(msg)}
        />
      )}

      {tab === "calendar" && (
        <CalendarSection
          projectId={projectId}
          episodes={episodes}
          accounts={accounts}
          publications={publications}
          submitting={submitting}
          setSubmitting={setSubmitting}
          onChanged={async () => {
            await reload();
          }}
          onError={(msg) => setFormError(msg)}
        />
      )}

      {tab === "library" && (
        <LibrarySection
          projectId={projectId}
          media={library}
          submitting={submitting}
          setSubmitting={setSubmitting}
          onChanged={async () => {
            await reload();
            if (selectedEpisodeId) await reloadEpisodeMedia(selectedEpisodeId);
          }}
          onError={(msg) => setFormError(msg)}
        />
      )}

      {tab === "social" && (
        <section className="section" aria-labelledby="social-heading">
          <div className="section-head">
            <h2 id="social-heading">Contas sociais</h2>
            <button
              type="button"
              className="btn"
              disabled={submitting}
              onClick={() => {
                setFormError(null);
                setEditing(null);
                setShowLink((v) => !v);
              }}
            >
              {showLink ? "Fechar" : "+ Vincular rede"}
            </button>
          </div>

          <p className="muted">
            Credenciais ficam só no servidor (encriptadas). OAuth oficial virá depois — por agora
            cola tokens / API keys.
          </p>

          {(showLink || editing) && (
            <SocialAccountForm
              key={editing?.id ?? "new"}
              mode={editing ? "edit" : "create"}
              initial={editing}
              submitting={submitting}
              onCancel={() => {
                setShowLink(false);
                setEditing(null);
                setFormError(null);
              }}
              onSubmit={async (payload) => {
                setFormError(null);
                setSubmitting(true);
                try {
                  if (editing) {
                    await updateSocialAccount(projectId, editing.id, {
                      displayName: payload.displayName,
                      status: payload.status,
                      externalAccountId: payload.externalAccountId,
                      credentials: payload.credentials,
                    });
                  } else {
                    await createSocialAccount(projectId, {
                      platform: payload.platform!,
                      displayName: payload.displayName,
                      status: payload.status,
                      externalAccountId: payload.externalAccountId,
                      credentials: payload.credentials,
                    });
                  }
                  setShowLink(false);
                  setEditing(null);
                  await reload();
                } catch (err) {
                  setFormError(
                    errMessage(
                      err,
                      editing
                        ? "Não foi possível atualizar a conta."
                        : "Não foi possível vincular a rede.",
                    ),
                  );
                } finally {
                  setSubmitting(false);
                }
              }}
            />
          )}

          {accounts.length === 0 ? (
            <p className="muted empty">Nenhuma rede vinculada ainda.</p>
          ) : (
            <ul className="account-list">
              {accounts.map((account) => (
                <li key={account.id} className="account-row">
                  <div>
                    <p className="account-name">{account.displayName}</p>
                    <p className="account-meta">
                      {PLATFORMS.find((p) => p.value === account.platform)?.label ??
                        account.platform}{" "}
                      ·{" "}
                      <span className={`status status--${account.status.toLowerCase()}`}>
                        {STATUS_LABEL[account.status]}
                      </span>
                    </p>
                    <p className="account-masks muted">{summarizeMasks(account)}</p>
                  </div>
                  <div className="account-actions">
                    <button
                      type="button"
                      className="btn btn--ghost"
                      disabled={submitting}
                      onClick={() => {
                        setShowLink(false);
                        setEditing(account);
                        setFormError(null);
                      }}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="btn btn--danger-ghost"
                      disabled={submitting}
                      onClick={() => void onDeleteAccount(account)}
                    >
                      Remover
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}

const KIND_LABEL: Record<ContentKind, string> = {
  VIDEO: "Vídeo",
  IMAGE: "Foto",
  CAROUSEL: "Carrossel",
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function ContentSection(props: {
  projectId: string;
  episodes: Episode[];
  selectedEpisode: Episode | null;
  episodeMedia: MediaAsset[];
  showNewContent: boolean;
  submitting: boolean;
  setSubmitting: (v: boolean) => void;
  onToggleNew: () => void;
  onSelectEpisode: (id: string | null) => void;
  onCreated: (ep: Episode) => Promise<void>;
  onDeleted: () => Promise<void>;
  onMediaChanged: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  const {
    projectId,
    episodes,
    selectedEpisode,
    episodeMedia,
    showNewContent,
    submitting,
    setSubmitting,
    onToggleNew,
    onSelectEpisode,
    onCreated,
    onDeleted,
    onMediaChanged,
    onError,
  } = props;
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ContentKind>("VIDEO");
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const ep = await createEpisode(projectId, {
        title: title.trim(),
        contentKind: kind,
      });
      setTitle("");
      setKind("VIDEO");
      await onCreated(ep);
    } catch (err) {
      onError(errMessage(err, "Não foi possível criar o conteúdo."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteEpisode(ep: Episode) {
    if (!window.confirm(`Apagar “${ep.title}” e a mídia associada?`)) return;
    setSubmitting(true);
    try {
      await deleteEpisode(projectId, ep.id);
      await onDeleted();
    } catch (err) {
      onError(errMessage(err, "Não foi possível apagar o conteúdo."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFiles(files: FileList | File[]) {
    if (!selectedEpisode) return;
    const list = Array.from(files);
    if (list.length === 0) return;
    setSubmitting(true);
    setUploadPct(0);
    try {
      for (const file of list) {
        await uploadEpisodeMedia(projectId, selectedEpisode.id, file, setUploadPct);
        if (selectedEpisode.contentKind !== "CAROUSEL") break;
      }
      await onMediaChanged();
    } catch (err) {
      onError(errMessage(err, "Upload falhou. Verifica o formato e o tamanho."));
    } finally {
      setSubmitting(false);
      setUploadPct(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragOver(false);
    if (submitting || !selectedEpisode) return;
    void handleFiles(event.dataTransfer.files);
  }

  const accept =
    selectedEpisode?.contentKind === "VIDEO"
      ? "video/mp4,video/webm"
      : "image/jpeg,image/png,image/webp";

  return (
    <section className="section" aria-labelledby="content-heading">
      <div className="section-head">
        <h2 id="content-heading">Conteúdo</h2>
        <button type="button" className="btn" disabled={submitting} onClick={onToggleNew}>
          {showNewContent ? "Fechar" : "+ Novo conteúdo"}
        </button>
      </div>

      {showNewContent && (
        <form className="stack-form stack-form--inset" onSubmit={(e) => void handleCreate(e)}>
          <label className="field">
            <span>Título</span>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Rival nasceu da água"
              disabled={submitting}
            />
          </label>
          <label className="field">
            <span>Tipo</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as ContentKind)}
              disabled={submitting}
            >
              {UI_CONTENT_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label} — {k.hint}
                </option>
              ))}
            </select>
          </label>
          <div className="form-actions">
            <button type="button" className="btn btn--ghost" onClick={onToggleNew} disabled={submitting}>
              Cancelar
            </button>
            <button type="submit" className="btn" disabled={submitting || !title.trim()}>
              {submitting ? "A criar…" : "Criar rascunho"}
            </button>
          </div>
        </form>
      )}

      {episodes.length === 0 ? (
        <p className="muted empty">Ainda não há conteúdo. Cria um vídeo, foto ou carrossel.</p>
      ) : (
        <ul className="account-list">
          {episodes.map((ep) => (
            <li key={ep.id} className={`account-row${selectedEpisode?.id === ep.id ? " account-row--selected" : ""}`}>
              <button
                type="button"
                className="content-pick"
                disabled={submitting}
                onClick={() =>
                  onSelectEpisode(selectedEpisode?.id === ep.id ? null : ep.id)
                }
              >
                <p className="account-name">{ep.title}</p>
                <p className="account-meta">
                  {KIND_LABEL[ep.contentKind]} · {ep.status}
                  {ep.mediaCount > 0 ? ` · ${ep.mediaCount} ficheiro(s)` : " · sem mídia"}
                </p>
              </button>
              <div className="account-actions">
                <button
                  type="button"
                  className="btn btn--danger-ghost"
                  disabled={submitting}
                  onClick={() => void handleDeleteEpisode(ep)}
                >
                  Apagar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {selectedEpisode && (
        <div className="upload-panel">
          <h3 className="upload-panel__title">Upload — {selectedEpisode.title}</h3>
          <p className="muted small">
            {selectedEpisode.contentKind === "CAROUSEL"
              ? "Arrasta várias imagens (ordem de envio = ordem do carrossel)."
              : selectedEpisode.contentKind === "VIDEO"
                ? "Envia um vídeo mp4 ou webm. Pré-visualização 9:16."
                : "Envia uma foto jpg, png ou webp. Pré-visualização 9:16."}
          </p>

          <div
            className={`dropzone${dragOver ? " dropzone--active" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <p>Arrasta ficheiros para aqui</p>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={submitting}
              onClick={() => fileInputRef.current?.click()}
            >
              Escolher ficheiro
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={accept}
              multiple={selectedEpisode.contentKind === "CAROUSEL"}
              hidden
              onChange={(e) => {
                if (e.target.files) void handleFiles(e.target.files);
              }}
            />
          </div>

          {uploadPct !== null && (
            <div className="progress" aria-label="Progresso do upload">
              <div className="progress__bar" style={{ width: `${uploadPct}%` }} />
              <span className="progress__label">{uploadPct}%</span>
            </div>
          )}

          {episodeMedia.length === 0 ? (
            <p className="muted empty">Sem ficheiros neste conteúdo.</p>
          ) : (
            <div className="preview-grid">
              {episodeMedia.map((asset) => (
                <MediaPreviewCard
                  key={asset.id}
                  asset={asset}
                  submitting={submitting}
                  onDelete={async () => {
                    if (!window.confirm("Apagar este ficheiro?")) return;
                    setSubmitting(true);
                    try {
                      await deleteMediaAsset(projectId, asset.id);
                      await onMediaChanged();
                    } catch (err) {
                      onError(errMessage(err, "Não foi possível apagar a mídia."));
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function LibrarySection(props: {
  projectId: string;
  media: MediaAsset[];
  submitting: boolean;
  setSubmitting: (v: boolean) => void;
  onChanged: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  const { projectId, media, submitting, setSubmitting, onChanged, onError } = props;

  return (
    <section className="section" aria-labelledby="library-heading">
      <div className="section-head">
        <h2 id="library-heading">Biblioteca</h2>
      </div>
      <p className="muted">Assets do projeto (imagens e vídeos já enviados).</p>
      {media.length === 0 ? (
        <p className="muted empty">Biblioteca vazia — faz upload num conteúdo.</p>
      ) : (
        <div className="preview-grid">
          {media.map((asset) => (
            <MediaPreviewCard
              key={asset.id}
              asset={asset}
              submitting={submitting}
              showMeta
              onDelete={async () => {
                if (!window.confirm("Apagar este asset da biblioteca?")) return;
                setSubmitting(true);
                try {
                  await deleteMediaAsset(projectId, asset.id);
                  await onChanged();
                } catch (err) {
                  onError(errMessage(err, "Não foi possível apagar o asset."));
                } finally {
                  setSubmitting(false);
                }
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function MediaPreviewCard(props: {
  asset: MediaAsset;
  submitting: boolean;
  showMeta?: boolean;
  onDelete: () => Promise<void>;
}) {
  const { asset, submitting, showMeta, onDelete } = props;
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    (async () => {
      try {
        objectUrl = await fetchMediaBlobUrl(asset.downloadUrl);
        if (active) setUrl(objectUrl);
      } catch {
        if (active) setUrl(null);
      }
    })();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [asset.downloadUrl]);

  const isVideo = asset.type === "VIDEO" || asset.mime.startsWith("video/");

  return (
    <article className="preview-card">
      <div className="preview-frame">
        {url ? (
          isVideo ? (
            <video src={url} controls playsInline />
          ) : (
            <img src={url} alt={asset.originalFilename ?? "Pré-visualização"} />
          )
        ) : (
          <p className="muted small">A carregar preview…</p>
        )}
      </div>
      {showMeta && (
        <p className="preview-meta muted small">
          {asset.type} · {formatBytes(asset.sizeBytes)}
          {asset.originalFilename ? ` · ${asset.originalFilename}` : ""}
        </p>
      )}
      <button
        type="button"
        className="btn btn--danger-ghost"
        disabled={submitting}
        onClick={() => void onDelete()}
      >
        Apagar
      </button>
    </article>
  );
}

function summarizeMasks(account: SocialAccount): string {
  const parts: string[] = [];
  const c = account.credentials;
  if (c.accessToken) parts.push(`token ${c.accessToken}`);
  if (c.apiKey) parts.push(`apiKey ${c.apiKey}`);
  if (c.clientId) parts.push(`clientId ${c.clientId}`);
  if (c.clientSecret) parts.push(`secret ${c.clientSecret}`);
  if (c.refreshToken) parts.push(`refresh ${c.refreshToken}`);
  if (c.hasExtraJson) parts.push("extraJson ✓");
  return parts.length ? parts.join(" · ") : "Sem credenciais guardadas";
}

function SocialAccountForm(props: {
  mode: "create" | "edit";
  initial: SocialAccount | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (payload: {
    platform?: SocialPlatform;
    displayName: string;
    status?: SocialAccountStatus;
    externalAccountId?: string;
    credentials?: SocialCredentialsInput;
  }) => Promise<void>;
}) {
  const { mode, initial, submitting, onCancel, onSubmit } = props;
  const [platform, setPlatform] = useState<SocialPlatform>(initial?.platform ?? "TIKTOK");
  const [displayName, setDisplayName] = useState(initial?.displayName ?? "");
  const [status, setStatus] = useState<SocialAccountStatus | "AUTO">(
    initial?.status ?? "AUTO",
  );
  const [externalAccountId, setExternalAccountId] = useState(
    initial?.externalAccountId ?? "",
  );
  const [creds, setCreds] = useState<SocialCredentialsInput>(emptyCreds());

  const fields = PLATFORM_FIELDS[platform];

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const credentials = pickFilledCredentials(creds);
    await onSubmit({
      ...(mode === "create" ? { platform } : {}),
      displayName: displayName.trim(),
      status: status === "AUTO" ? undefined : status,
      externalAccountId: externalAccountId.trim() || undefined,
      credentials,
    });
  }

  return (
    <form className="stack-form stack-form--inset" onSubmit={(e) => void handleSubmit(e)}>
      <p className="notice">
        OAuth oficial (TikTok / Meta / YouTube) chega depois. Por enquanto cola tokens ou API
        keys — não ficam guardados em texto no browser depois de enviar.
      </p>

      {mode === "create" && (
        <label className="field">
          <span>Plataforma</span>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as SocialPlatform)}
            disabled={submitting}
          >
            {PLATFORMS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="field">
        <span>Nome de exibição</span>
        <input
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="@canal ou nome da página"
          disabled={submitting}
        />
      </label>

      <label className="field">
        <span>ID externo (opcional)</span>
        <input
          value={externalAccountId}
          onChange={(e) => setExternalAccountId(e.target.value)}
          placeholder={
            platform === "INSTAGRAM"
              ? "IG User ID (Graph) — obrigatório para Reels"
              : platform === "TIKTOK"
                ? "open_id (opcional)"
                : "channel / page id"
          }
          disabled={submitting}
        />
      </label>

      <label className="field">
        <span>Estado</span>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as SocialAccountStatus | "AUTO")}
          disabled={submitting}
        >
          <option value="AUTO">Automático (ligado se houver credenciais)</option>
          <option value="CONNECTED">Ligado</option>
          <option value="NEEDS_CREDENTIALS">Faltam credenciais</option>
          <option value="MANUAL">Manual (checklist / ManualPublisher)</option>
        </select>
      </label>

      <fieldset className="cred-fieldset">
        <legend>Credenciais</legend>
        {mode === "edit" && (
          <p className="muted small">
            Deixa em branco para manter o valor já guardado. Máscaras atuais:{" "}
            {initial ? summarizeMasks(initial) : "—"}.
          </p>
        )}
        {fields.map((field) => (
          <label key={field.key} className="field">
            <span>{field.label}</span>
            <input
              type={field.key === "extraJson" ? "text" : "password"}
              autoComplete="off"
              value={creds[field.key] ?? ""}
              onChange={(e) =>
                setCreds((prev) => ({ ...prev, [field.key]: e.target.value }))
              }
              placeholder={field.hint ?? (mode === "edit" ? "•••• (inalterado)" : undefined)}
              disabled={submitting}
            />
          </label>
        ))}
      </fieldset>

      <div className="form-actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
        <button type="submit" className="btn" disabled={submitting || !displayName.trim()}>
          {submitting
            ? "A guardar…"
            : mode === "edit"
              ? "Guardar alterações"
              : "Vincular conta"}
        </button>
      </div>
    </form>
  );
}

const PUBLICATION_STATUS_LABEL: Record<PublicationStatus, string> = {
  DRAFT: "Rascunho",
  SCHEDULED: "Agendado",
  PUBLISHING: "A publicar…",
  PUBLISHED: "Publicado",
  FAILED: "Falhou",
  CANCELLED: "Cancelado",
  MANUAL_REQUIRED: "Upload manual",
};

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function CalendarSection(props: {
  projectId: string;
  episodes: Episode[];
  accounts: SocialAccount[];
  publications: ScheduledPublication[];
  submitting: boolean;
  setSubmitting: (v: boolean) => void;
  onChanged: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  const {
    projectId,
    episodes,
    accounts,
    publications,
    submitting,
    setSubmitting,
    onChanged,
    onError,
  } = props;

  const [showWizard, setShowWizard] = useState(false);
  const [episodeId, setEpisodeId] = useState("");
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const [times, setTimes] = useState<Record<string, string>>({});

  const publishableAccounts = accounts.filter((a) =>
    ["TIKTOK", "INSTAGRAM", "KWAI"].includes(a.platform),
  );

  function toggleAccount(id: string) {
    setSelectedAccountIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      const account = accounts.find((a) => a.id === id);
      const defaultTime = toLocalInputValue(new Date(Date.now() + 5 * 60_000));
      setTimes((t) => ({ ...t, [id]: t[id] ?? defaultTime }));
      setCaptions((c) => ({
        ...c,
        [id]: c[id] ?? episodes.find((e) => e.id === episodeId)?.hook ?? "",
      }));
      if (account?.platform === "KWAI") {
        /* UX note shown below */
      }
      return [...prev, id];
    });
  }

  async function onSchedule(event: FormEvent) {
    event.preventDefault();
    onError("");
    if (!episodeId) {
      onError("Seleciona um conteúdo.");
      return;
    }
    if (selectedAccountIds.length === 0) {
      onError("Seleciona pelo menos uma conta.");
      return;
    }
    setSubmitting(true);
    try {
      await createSchedule(projectId, {
        episodeId,
        targets: selectedAccountIds.map((socialAccountId) => ({
          socialAccountId,
          scheduledAt: new Date(times[socialAccountId] || Date.now()).toISOString(),
          caption: captions[socialAccountId]?.trim() || undefined,
        })),
      });
      setShowWizard(false);
      setSelectedAccountIds([]);
      setEpisodeId("");
      await onChanged();
    } catch (err) {
      onError(errMessage(err, "Não foi possível agendar."));
    } finally {
      setSubmitting(false);
    }
  }

  async function runAction(
    label: string,
    fn: () => Promise<unknown>,
  ): Promise<void> {
    onError("");
    setSubmitting(true);
    try {
      await fn();
      await onChanged();
    } catch (err) {
      onError(errMessage(err, `Falha: ${label}`));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="section" aria-labelledby="calendar-heading">
      <div className="section-head">
        <h2 id="calendar-heading">Calendário</h2>
        <button
          type="button"
          className="btn"
          disabled={submitting || episodes.length === 0}
          onClick={() => {
            onError("");
            setShowWizard((v) => !v);
          }}
        >
          {showWizard ? "Fechar" : "Agendar publicação"}
        </button>
      </div>

      <p className="muted">
        Escolhe conteúdo → redes → legendas → horários. O scheduler na API faz claim
        atómico. Kwai fica sempre em upload manual (sem API pública BR).
      </p>

      {showWizard && (
        <form className="stack-form stack-form--inset" onSubmit={onSchedule}>
          <label className="field">
            <span>Conteúdo</span>
            <select
              required
              value={episodeId}
              onChange={(e) => setEpisodeId(e.target.value)}
              disabled={submitting}
            >
              <option value="">— selecionar —</option>
              {episodes.map((ep) => (
                <option key={ep.id} value={ep.id}>
                  {ep.title} ({ep.contentKind}
                  {ep.mediaCount ? `, ${ep.mediaCount} ficheiros` : ", sem mídia"})
                </option>
              ))}
            </select>
          </label>

          <fieldset className="cred-fieldset">
            <legend>Plataformas</legend>
            {publishableAccounts.length === 0 ? (
              <p className="muted small">
                Vincula TikTok, Instagram ou Kwai em Contas sociais primeiro.
              </p>
            ) : (
              publishableAccounts.map((account) => {
                const checked = selectedAccountIds.includes(account.id);
                return (
                  <div key={account.id} className="schedule-target">
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={submitting}
                        onChange={() => toggleAccount(account.id)}
                      />
                      <span>
                        {account.platform} · {account.displayName}
                        {account.platform === "KWAI" ? " (manual)" : ""}
                      </span>
                    </label>
                    {checked && (
                      <>
                        {account.platform === "KWAI" && (
                          <p className="muted small">
                            Kwai: o Hub gera checklist; publicas no app e marcas como
                            publicado.
                          </p>
                        )}
                        <label className="field">
                          <span>Horário</span>
                          <input
                            type="datetime-local"
                            required
                            value={times[account.id] ?? ""}
                            onChange={(e) =>
                              setTimes((prev) => ({
                                ...prev,
                                [account.id]: e.target.value,
                              }))
                            }
                            disabled={submitting}
                          />
                        </label>
                        <label className="field">
                          <span>Legenda</span>
                          <textarea
                            rows={2}
                            value={captions[account.id] ?? ""}
                            onChange={(e) =>
                              setCaptions((prev) => ({
                                ...prev,
                                [account.id]: e.target.value,
                              }))
                            }
                            disabled={submitting}
                          />
                        </label>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </fieldset>

          <button
            type="submit"
            className="btn"
            disabled={submitting || selectedAccountIds.length === 0 || !episodeId}
          >
            {submitting ? "A agendar…" : "Rever e agendar"}
          </button>
        </form>
      )}

      {publications.length === 0 ? (
        <p className="muted empty">Ainda não há agendamentos.</p>
      ) : (
        <ul className="pub-list">
          {publications.map((pub) => {
            const episode = episodes.find((e) => e.id === pub.episodeId);
            const account = accounts.find((a) => a.id === pub.socialAccountId);
            return (
              <li key={pub.id} className="pub-row">
                <div className="pub-main">
                  <span className={`pub-status pub-status--${pub.status.toLowerCase()}`}>
                    {PUBLICATION_STATUS_LABEL[pub.status]}
                  </span>
                  <strong>
                    {pub.platform}
                    {account ? ` · ${account.displayName}` : ""}
                  </strong>
                  <span className="muted small">
                    {episode?.title ?? pub.episodeId} ·{" "}
                    {new Date(pub.scheduledAt).toLocaleString()}
                  </span>
                  {pub.errorMessage && (
                    <p className="bad small" role="alert">
                      {pub.errorMessage}
                    </p>
                  )}
                  {pub.checklist && pub.checklist.length > 0 && (
                    <ol className="checklist">
                      {pub.checklist.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ol>
                  )}
                  {pub.externalPostId && (
                    <p className="muted small">ID externo: {pub.externalPostId}</p>
                  )}
                </div>
                <div className="pub-actions">
                  {(pub.status === "SCHEDULED" || pub.status === "FAILED") && (
                    <button
                      type="button"
                      className="btn btn--ghost"
                      disabled={submitting}
                      onClick={() =>
                        void runAction("publicar agora", () =>
                          publishNow(projectId, pub.id),
                        )
                      }
                    >
                      Publicar agora
                    </button>
                  )}
                  {(pub.status === "FAILED" || pub.status === "MANUAL_REQUIRED") && (
                    <button
                      type="button"
                      className="btn btn--ghost"
                      disabled={submitting}
                      onClick={() =>
                        void runAction("retry", () => retryPublication(projectId, pub.id))
                      }
                    >
                      Retry
                    </button>
                  )}
                  {pub.status === "MANUAL_REQUIRED" && (
                    <button
                      type="button"
                      className="btn"
                      disabled={submitting}
                      onClick={() =>
                        void runAction("marcar publicado", () =>
                          markPublished(projectId, pub.id),
                        )
                      }
                    >
                      Marquei como publicado
                    </button>
                  )}
                  {pub.status === "SCHEDULED" && (
                    <button
                      type="button"
                      className="btn btn--danger-ghost"
                      disabled={submitting}
                      onClick={() =>
                        void runAction("cancelar", () =>
                          cancelPublication(projectId, pub.id),
                        )
                      }
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
