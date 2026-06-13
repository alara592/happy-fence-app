"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useCached, peek } from "@/lib/cache";
import { fmtDate, fmtApptClock, fmtUSD, etDate, city, mapsUrl } from "@/lib/format";

/**
 * Desktop dashboard home (design Option A, Anthony 2026-06-12): today's site visits →
 * needs-attention strip → the full project card grid WITH totals. Mounted only at
 * ≥1024px (useIsDesktop), so phones never fetch the appointments it reads. Everything
 * here is composition of already-loaded data: bundles come from the home prefetch
 * cache; visits from the synced appointments table.
 */

export interface ProjectListItem {
  id: string;
  client: string;
  address: string | null;
  date: string;
  permit: boolean;
  created_at: string;
  updated_at: string;
}

/** The slice of a cached project bundle the dashboard reads (full shape in projects/[id]). */
export interface DashBundle {
  activeType: string | null;
  totalLinearFt: number;
  photos: unknown[];
  sections?: unknown[];
  total?: number | null;
}

interface Appointment {
  id: string;
  client: string;
  address: string | null;
  start_at: string | null;
  status: string;
  project_id: string | null;
}

interface Props {
  projects: ProjectListItem[] | undefined;
  bundles: Map<string, DashBundle>;
  error: Error | undefined;
  q: string;
  setQ: (q: string) => void;
}

function isToday(createdAt: string): boolean {
  const d = new Date(createdAt);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export default function DesktopHome({ projects, bundles, error, q, setQ }: Props) {
  const router = useRouter();
  const { data: appts } = useCached<Appointment[]>("/api/appointments?all=1");
  const [busy, setBusy] = useState<string | null>(null);
  const [apptError, setApptError] = useState("");

  const todayET = etDate(new Date());
  const todayVisits = useMemo(
    () =>
      (appts ?? [])
        .filter((a) => a.start_at && etDate(a.start_at) === todayET)
        .sort((a, b) => (a.start_at ?? "").localeCompare(b.start_at ?? "")),
    [appts, todayET],
  );

  // Needs attention: measured but nothing priced, or an empty shell with no measurements.
  const attention = useMemo(() => {
    if (!projects) return [];
    const out: { id: string; client: string; why: string; detail: string }[] = [];
    for (const p of projects) {
      const b = bundles.get(p.id);
      if (!b || !b.sections) continue;
      if (b.sections.length === 0) {
        out.push({ id: p.id, client: p.client, why: "No measurements yet", detail: `created ${fmtDate(p.created_at)}` });
      } else if (!b.activeType) {
        out.push({ id: p.id, client: p.client, why: "No fence selected", detail: `${b.totalLinearFt} ft measured` });
      }
    }
    return out.slice(0, 6);
  }, [projects, bundles]);

  const filtered = useMemo(() => {
    if (!projects) return null;
    const needle = q.trim().toLowerCase();
    return needle
      ? projects.filter(
          (p) =>
            p.client.toLowerCase().includes(needle) ||
            (p.address ?? "").toLowerCase().includes(needle),
        )
      : projects;
  }, [projects, q]);

  const groups = useMemo(() => {
    if (!filtered) return null;
    const today = filtered.filter((p) => isToday(p.created_at));
    const earlier = filtered.filter((p) => !isToday(p.created_at));
    const sort = (a: ProjectListItem, b: ProjectListItem) => b.updated_at.localeCompare(a.updated_at);
    return [
      ["Created today", today.sort(sort)],
      ["Earlier", earlier.sort(sort)],
    ] as const;
  }, [filtered]);

  async function createProject(a: Appointment) {
    setBusy(a.id);
    setApptError("");
    try {
      const { project_id } = await api<{ project_id: string }>(
        `/api/appointments/${a.id}/create-project`,
        { method: "POST" },
      );
      router.push(`/projects/${project_id}`);
    } catch (e) {
      setApptError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="dk-home">
      <div className="dk-sec">
        <h2>Today — {fmtDate(todayET)}</h2>
        <Link href="/appointments" className="dk-more">all appointments →</Link>
      </div>
      {apptError && <p className="error">{apptError}</p>}
      {todayVisits.length === 0 ? (
        <div className="dk-today-empty">No site visits today.</div>
      ) : (
        <div className="dk-today">
          {todayVisits.map((a) => {
            const linkedTotal = a.project_id
              ? (peek<DashBundle>(`/api/projects/${a.project_id}`)?.total ?? null)
              : null;
            return (
              <div key={a.id} className="dk-visit">
                <div className="t">{fmtApptClock(a.start_at)}</div>
                <div className="who">{a.client || "—"}</div>
                <div className="addr">{a.address || "—"}</div>
                <div className="act">
                  {a.address && (
                    <a href={mapsUrl(a.address)} target="_blank" rel="noopener noreferrer">📍 Map</a>
                  )}
                  {a.project_id ? (
                    <Link href={`/projects/${a.project_id}`} className="chip ok">
                      Project ✓{linkedTotal !== null ? ` · ${fmtUSD(linkedTotal)}` : ""}
                    </Link>
                  ) : (
                    <button className="chip new" disabled={busy === a.id} onClick={() => createProject(a)}>
                      {busy === a.id ? "…" : "+ Create project"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {attention.length > 0 && (
        <>
          <div className="dk-sec"><h2>Needs attention</h2></div>
          <div className="dk-attn">
            {attention.map((x) => (
              <Link key={x.id} href={`/projects/${x.id}`} className="dk-attn-card">
                <span className="why">{x.why}</span>
                <span className="who">{x.client} · {x.detail}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="pickets" />
      <div className="dk-gridhead">
        <h2>All projects</h2>
        <div className="search" style={{ margin: 0, flex: 1, maxWidth: 340 }}>
          <span className="ico">🔍</span>
          <input
            type="text"
            placeholder="Search client or address"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {filtered && <span className="muted">{filtered.length} {filtered.length === 1 ? "quote" : "quotes"}</span>}
        <Link href="/projects/new"><button className="primary">+ New</button></Link>
      </div>

      {error && !projects && <p className="error">{error.message}</p>}
      {!projects && !error && <div className="skel" />}
      {projects?.length === 0 && <p className="muted">No projects yet.</p>}
      {filtered && projects && projects.length > 0 && filtered.length === 0 && (
        <p className="muted">No matches.</p>
      )}

      {groups && (
        <div className="dk-pgrid">
          {groups.map(([label, list]) =>
            list.length === 0 ? null : (
              <div key={label} style={{ display: "contents" }}>
                <div className="dk-group-lbl">{label}</div>
                {list.map((p) => {
                  const b = bundles.get(p.id);
                  const photoCount = b?.photos?.length ?? 0;
                  return (
                    <div key={p.id} className="dk-pcard">
                      <Link href={`/projects/${p.id}`} className="dk-pcard-link">
                        <span className="who">{p.client}</span>
                        {b && (b.total !== null && b.total !== undefined ? (
                          <span className="tot">{fmtUSD(b.total)}</span>
                        ) : (
                          <span className="tot none">{b.activeType ? "—" : "no fence"}</span>
                        ))}
                        <span className="fence">
                          {b
                            ? b.activeType
                              ? `${b.activeType} · ${b.totalLinearFt} ft`
                              : b.sections && b.sections.length > 0
                                ? `${b.totalLinearFt} ft measured`
                                : "No measurements yet"
                            : ""}
                        </span>
                        <span className="meta">
                          {city(p.address) || "—"} · {fmtDate(p.date)}
                          {p.permit ? " · Permit" : ""}
                          {photoCount > 0 ? ` · 📷 ${photoCount}` : ""}
                        </span>
                      </Link>
                      {p.address && (
                        <a
                          className="dk-pin"
                          href={mapsUrl(p.address)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Directions"
                        >
                          📍
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
