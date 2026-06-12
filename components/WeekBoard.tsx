"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useCached, load } from "@/lib/cache";
import { fmtApptClock, fmtApptTime, etDate, city, mapsUrl } from "@/lib/format";

/**
 * Desktop appointments week board (design approved 2026-06-12): 5 rolling days
 * starting today, today tinted. Mounted only at ≥1024px; reads ?all=1 through the
 * client cache and windows client-side, so the board and "Show all" share one fetch.
 * Sync / Create Project hit the same endpoints as the phone list.
 */

interface Appointment {
  id: string;
  client: string;
  address: string | null;
  start_at: string | null;
  status: string;
  notes: string | null;
  project_id: string | null;
}

const APPTS_KEY = "/api/appointments?all=1";
const DAYS = 5;

/** Day label parts in Miami time. */
function dayParts(d: Date): { name: string; num: string } {
  return {
    name: d.toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short" }),
    num: d.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "numeric", day: "numeric" }),
  };
}

export default function WeekBoard() {
  const router = useRouter();
  const { data: appts, error } = useCached<Appointment[]>(APPTS_KEY);
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [showAll, setShowAll] = useState(false);

  const days = useMemo(() => {
    const now = Date.now();
    return Array.from({ length: DAYS }, (_, i) => {
      const d = new Date(now + i * 86400000);
      return { key: etDate(d), ...dayParts(d), today: i === 0 };
    });
  }, []);

  const byDay = useMemo(() => {
    const m = new Map<string, Appointment[]>(days.map((d) => [d.key, []]));
    for (const a of appts ?? []) {
      if (!a.start_at) continue;
      const k = etDate(a.start_at);
      m.get(k)?.push(a);
    }
    for (const list of m.values()) {
      list.sort((a, b) => (a.start_at ?? "").localeCompare(b.start_at ?? ""));
    }
    return m;
  }, [appts, days]);

  // Everything not on the board (before today or past the window), newest first.
  const offBoard = useMemo(() => {
    const onBoard = new Set(days.map((d) => d.key));
    return (appts ?? [])
      .filter((a) => !a.start_at || !onBoard.has(etDate(a.start_at)))
      .sort((a, b) => (b.start_at ?? "").localeCompare(a.start_at ?? ""));
  }, [appts, days]);

  async function syncNow() {
    setSyncing(true);
    setActionError("");
    try {
      await api("/api/appointments/sync", { method: "POST" });
      await load(APPTS_KEY);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  async function createProject(a: Appointment) {
    setBusy(a.id);
    setActionError("");
    try {
      const { project_id } = await api<{ project_id: string }>(
        `/api/appointments/${a.id}/create-project`,
        { method: "POST" },
      );
      router.push(`/projects/${project_id}`);
    } catch (e) {
      setActionError((e as Error).message);
      setBusy(null);
    }
  }

  function apptCard(a: Appointment, clock = true) {
    return (
      <div key={a.id} className="wk-appt">
        <div className="at">{clock ? fmtApptClock(a.start_at) : fmtApptTime(a.start_at) || "—"}</div>
        <div className="who">{a.client || "—"}</div>
        <div className="addr">{a.address || "—"}</div>
        <div className="foot">
          {a.address && (
            <a className="mk" href={mapsUrl(a.address)} target="_blank" rel="noopener noreferrer">📍 Map</a>
          )}
          {a.project_id ? (
            <Link href={`/projects/${a.project_id}`} className="chip ok">Project ✓</Link>
          ) : (
            <button className="mk-btn" disabled={busy === a.id} onClick={() => createProject(a)}>
              {busy === a.id ? "…" : "+ Create project"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="wk-board">
      <div className="wk-head">
        <h1>Site visits</h1>
        <button className="secondary" onClick={syncNow} disabled={syncing}>
          {syncing ? "Syncing…" : "⟳ Sync now"}
        </button>
        <span className="muted">auto-syncs every 15 min</span>
        <button className="quiet wk-showall" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Hide other dates" : "Show all →"}
        </button>
      </div>
      {(error || actionError) && <p className="error">{actionError || error?.message}</p>}
      {!appts && !error && <p className="muted">Loading…</p>}

      <div className="wk-week">
        {days.map((d) => {
          const list = byDay.get(d.key) ?? [];
          return (
            <div key={d.key} className={`wk-day${d.today ? " wk-dtoday" : ""}`}>
              <div className="wk-day-h">
                <span className="dname">{d.today ? "Today" : d.name}</span>
                <span className="dnum">{d.num}</span>
              </div>
              {list.length === 0 ? (
                <div className="wk-day-empty">No visits</div>
              ) : (
                list.map((a) => apptCard(a))
              )}
            </div>
          );
        })}
      </div>

      {showAll && (
        <>
          <div className="dk-sec" style={{ marginTop: 22 }}>
            <h2>Other dates ({offBoard.length})</h2>
          </div>
          {offBoard.length === 0 ? (
            <p className="muted">Nothing outside this window.</p>
          ) : (
            <div className="wk-rest">
              {offBoard.map((a) => (
                <div key={a.id} className="wk-rest-row">
                  <span className="when">{fmtApptTime(a.start_at) || "—"}</span>
                  <span className="who">{a.client || "—"}</span>
                  <span className="muted">{city(a.address)}</span>
                  <span className="end">
                    {a.project_id ? (
                      <Link href={`/projects/${a.project_id}`} className="chip ok">Project ✓</Link>
                    ) : (
                      <button className="mk-btn" disabled={busy === a.id} onClick={() => createProject(a)}>
                        {busy === a.id ? "…" : "+ Create project"}
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
