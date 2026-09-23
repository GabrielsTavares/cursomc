import { useEffect, useState, type FormEvent } from "react";
import type { ContentProject, User } from "@creator-hub/shared-types";
import {
  ApiClientError,
  apiBaseUrl,
  fetchMe,
  fetchProjects,
  login,
  logout,
} from "./api";

type Session = {
  user: User;
  projects: ContentProject[];
};

type BootState = "loading" | "guest" | "ready";

export function App() {
  const [boot, setBoot] = useState<BootState>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("admin@creator.local");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      // Prefer Bearer from sessionStorage; cookie httpOnly still sent via credentials.
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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { user } = await login(email.trim(), password);
      const projects = await fetchProjects();
      setSession({ user, projects });
      setBoot("ready");
      setPassword("");
    } catch (err) {
      const message =
        err instanceof ApiClientError
          ? err.message
          : "Falha inesperada ao entrar.";
      setError(message);
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
    return (
      <main className="page">
        <header className="top">
          <p className="brand brand--compact">Creator Hub</p>
          <button type="button" className="btn btn--ghost" onClick={onLogout} disabled={submitting}>
            Sair
          </button>
        </header>
        <h1>Olá, {session.user.displayName}</h1>
        <p className="lede">{session.user.email}</p>

        <section className="panel" aria-labelledby="projects-heading">
          <h2 id="projects-heading">Projetos</h2>
          {session.projects.length === 0 ? (
            <p className="muted">Ainda não há projetos. Crie um via API (POST /api/v1/projects).</p>
          ) : (
            <ul className="project-list">
              {session.projects.map((project) => (
                <li key={project.id}>
                  <span className="project-name">{project.name}</span>
                  <span className="project-meta">{project.projectType}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <p className="brand">Creator Hub</p>
      <h1>Entrar</h1>
      <p className="lede">Phase 1 — login na API em {apiBaseUrl()}.</p>

      <form className="login-form" onSubmit={onSubmit} noValidate>
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
