import { useEffect, useState } from "react";

type Health = {
  status: string;
  service: string;
  checks: { database: string };
};

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/health`)
      .then(async (res) => {
        const body = (await res.json()) as Health;
        if (!cancelled) setHealth(body);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to reach API");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="page">
      <p className="brand">Creator Hub</p>
      <h1>Foundation online</h1>
      <p className="lede">Phase 1 placeholder — web calls the API health endpoint.</p>
      <section className="status" aria-live="polite">
        {error && <p className="bad">API unreachable: {error}</p>}
        {!error && !health && <p>Checking {API_URL}/health…</p>}
        {health && (
          <p className={health.status === "ok" ? "ok" : "warn"}>
            {health.service}: {health.status} (db {health.checks.database})
          </p>
        )}
      </section>
    </main>
  );
}
