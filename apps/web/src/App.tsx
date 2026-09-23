import { useEffect, useState, type FormEvent } from "react";
import type {
  ContentProject,
  ProjectType,
  SocialAccount,
  SocialAccountStatus,
  SocialCredentialsInput,
  SocialPlatform,
  User,
} from "@creator-hub/shared-types";
import {
  ApiClientError,
  UI_PROJECT_TYPES,
  apiBaseUrl,
  createProject,
  createSocialAccount,
  deleteProject,
  deleteSocialAccount,
  fetchMe,
  fetchProject,
  fetchProjects,
  fetchSocialAccounts,
  login,
  logout,
  updateSocialAccount,
} from "./api";

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showLink, setShowLink] = useState(false);
  const [editing, setEditing] = useState<SocialAccount | null>(null);

  async function reload() {
    const [p, list] = await Promise.all([
      fetchProject(projectId),
      fetchSocialAccounts(projectId),
    ]);
    setProject(p);
    setAccounts(list);
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

  async function onDeleteProject() {
    if (!project) return;
    if (!window.confirm(`Apagar o projeto “${project.name}”? Isto remove as contas sociais.`)) {
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

  return (
    <main className="page page--wide">
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
          Vincula TikTok, Instagram, YouTube, Kwai e outras redes. Credenciais ficam só no
          servidor (encriptadas). OAuth oficial virá depois — por agora cola tokens / API keys.
        </p>
      </section>

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

        {formError && (
          <p className="bad" role="alert">
            {formError}
          </p>
        )}

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
                  <p className="account-masks muted">
                    {summarizeMasks(account)}
                  </p>
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
    </main>
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
          placeholder="channel / page id"
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
