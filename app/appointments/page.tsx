"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client";
import { fmtApptTime } from "@/lib/format";

interface Appointment {
  id: string;
  client: string;
  address: string | null;
  start_at: string | null;
  status: string;
  notes: string | null;
  project_id: string | null;
}

/** Appointments — synced from Google Calendar "Site Visit" events. */
export default function AppointmentsPage() {
  const router = useRouter();
  const [appts, setAppts] = useState<Appointment[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  function load() {
    api<Appointment[]>("/api/appointments").then(setAppts).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function syncNow() {
    setSyncing(true);
    setError("");
    try {
      await api("/api/appointments/sync", { method: "POST" });
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  async function createProject(a: Appointment) {
    setBusy(a.id);
    setError("");
    try {
      const { project_id } = await api<{ project_id: string }>(
        `/api/appointments/${a.id}/create-project`,
        { method: "POST" },
      );
      router.push(`/projects/${project_id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <>
      <div className="spread">
        <h1>Appointments</h1>
        <div className="actions">
          <button onClick={syncNow} disabled={syncing}>
            {syncing ? "Syncing…" : "Sync now"}
          </button>
          <Link href="/">
            <button>Projects</button>
          </Link>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {appts === null && !error && <p className="muted">Loading…</p>}
      {appts?.length === 0 && (
        <p className="muted">No appointments yet. They sync from your calendar’s “Site Visit” events.</p>
      )}
      {appts?.map((a) => (
        <div key={a.id} className="card">
          <div className="spread">
            <strong>{a.client || "—"}</strong>
            <span className="muted">{fmtApptTime(a.start_at)}</span>
          </div>
          <div className="muted">{a.address || "No address"}</div>
          {a.notes && <div className="muted" style={{ marginTop: 6, whiteSpace: "pre-line" }}>{a.notes}</div>}
          <div className="actions">
            {a.project_id ? (
              <Link href={`/projects/${a.project_id}`} style={{ flex: 1 }}>
                <button style={{ width: "100%" }}>View project →</button>
              </Link>
            ) : (
              <button
                className="primary"
                style={{ flex: 1 }}
                disabled={busy === a.id}
                onClick={() => createProject(a)}
              >
                {busy === a.id ? "Creating…" : "Create Project →"}
              </button>
            )}
          </div>
        </div>
      ))}
    </>
  );
}
