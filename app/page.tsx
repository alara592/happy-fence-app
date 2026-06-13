"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import Link from "next/link";
import { useCached, prefetch, peek, subscribe } from "@/lib/cache";
import { fmtDate, mapsUrl } from "@/lib/format";
import { useIsDesktop } from "@/lib/useIsDesktop";
import DesktopHome, { type DashBundle } from "@/components/DesktopHome";

interface ProjectListItem {
  id: string;
  client: string;
  address: string | null;
  date: string;
  permit: boolean;
  created_at: string;
  updated_at: string;
}

/** The slice of a project bundle the list cards read (full shape in projects/[id]).
 * No prices here — Anthony's rule (2026-06-11): the home list shows no dollar amounts. */
interface BundlePeek {
  activeType: string | null;
  totalLinearFt: number;
  photos: unknown[];
}

/** City = tail of the address; good enough for the list line. */
function city(address: string | null): string {
  if (!address) return "";
  const parts = address.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts[1] : "";
}

const GROUPS = ["Created Today", "Earlier"] as const;
type Group = (typeof GROUPS)[number];

/** Projects are created day-of, so bucket on creation date, not job date. */
function bucket(createdAt: string): Group {
  const d = new Date(createdAt);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
    ? "Created Today"
    : "Earlier";
}

/** Peek every project's cached bundle; re-render as prefetches land. */
function useBundlePeeks(projects: ProjectListItem[] | undefined): Map<string, BundlePeek> {
  const [, bump] = useReducer((x) => x + 1, 0);
  const ids = projects?.map((p) => p.id).join(",") ?? "";
  useEffect(() => {
    if (!ids) return;
    const unsubs = ids.split(",").map((id) => subscribe(`/api/projects/${id}`, bump));
    return () => {
      for (const u of unsubs) u();
    };
  }, [ids]);
  const m = new Map<string, BundlePeek>();
  for (const id of ids ? ids.split(",") : []) {
    const b = peek<BundlePeek>(`/api/projects/${id}`);
    if (b) m.set(id, b);
  }
  return m;
}

/** Screen 2 — project list: brand header, search, stats strip, bundle-backed cards. */
export default function ProjectListPage() {
  const { data: projects, error } = useCached<ProjectListItem[]>("/api/projects");
  const [q, setQ] = useState("");
  const bundles = useBundlePeeks(projects);
  const isDesktop = useIsDesktop();

  // Warm up everything on entry so the rest of the app feels instant (Anthony's pref:
  // a longer first load in exchange for instant navigation afterward).
  useEffect(() => {
    prefetch("/api/reference");
    if (projects) for (const p of projects) prefetch(`/api/projects/${p.id}`);
  }, [projects]);

  const grouped = useMemo(() => {
    if (!projects) return null;
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? projects.filter(
          (p) =>
            p.client.toLowerCase().includes(needle) ||
            (p.address ?? "").toLowerCase().includes(needle),
        )
      : projects;
    const by: Record<Group, ProjectListItem[]> = { "Created Today": [], Earlier: [] };
    for (const p of filtered) by[bucket(p.created_at)].push(p);
    // last edited first within each group
    for (const g of GROUPS) by[g].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return { by, filtered };
  }, [projects, q]);

  // Stats strip: count of whatever's listed (follows the search). No dollar amounts.
  const stats = grouped ? { count: grouped.filtered.length } : null;

  // Desktop (≥1024px) gets the dashboard home; the phone tree below is unchanged.
  if (isDesktop) {
    return (
      <DesktopHome
        projects={projects}
        bundles={bundles as Map<string, DashBundle>}
        error={error}
        q={q}
        setQ={setQ}
      />
    );
  }

  return (
    <>
      <div className="hm-head">
        <h1>
          <img className="hm-badge" src="/brand/logo-96.png" alt="" />
          Projects
        </h1>
        <div className="actions" style={{ margin: 0 }}>
          <Link href="/appointments">
            <button className="hm-appts">Appointments</button>
          </Link>
          <Link href="/projects/new">
            <button className="hm-new">+ New</button>
          </Link>
        </div>
      </div>

      <div className="search">
        <span className="ico">🔍</span>
        <input
          type="text"
          placeholder="Search client or address"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {stats && stats.count > 0 && (
        <div className="hm-stats">
          <strong>{stats.count}</strong>&nbsp;{stats.count === 1 ? "quote" : "quotes"}
        </div>
      )}

      {error && !projects && <p className="error">{error.message}</p>}
      {!projects && !error && (
        <>
          <div className="skel" />
          <div className="skel" />
          <div className="skel" />
        </>
      )}
      {projects?.length === 0 && (
        <div className="hm-empty">
          <p className="muted">No projects yet.</p>
          <Link href="/projects/new">
            <button className="secondary">+ New Project</button>
          </Link>
        </div>
      )}
      {grouped && projects && projects.length > 0 && grouped.filtered.length === 0 && (
        <p className="muted">No matches.</p>
      )}

      {grouped &&
        GROUPS.map((g) =>
          grouped.by[g].length === 0 ? null : (
            <div key={g}>
              <div className="group-h">{g}</div>
              {grouped.by[g].map((p) => {
                const b = bundles.get(p.id);
                const photoCount = b?.photos?.length ?? 0;
                return (
                  <div key={p.id} className="card hm-card">
                    <Link href={`/projects/${p.id}`} className="hm-link">
                      <strong>{p.client}</strong>
                      {b &&
                        (b.activeType ? (
                          <div className="muted">
                            {b.activeType} · {b.totalLinearFt} ft
                          </div>
                        ) : (
                          <div className="hm-nofence">No fence selected</div>
                        ))}
                      <div className="muted hm-meta">
                        {city(p.address) || "—"} · {fmtDate(p.date)}
                        {p.permit ? " · Permit" : ""}
                        {photoCount > 0 ? ` · 📷 ${photoCount}` : ""}
                      </div>
                    </Link>
                    {p.address && (
                      <a
                        className="pin hm-pin"
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
    </>
  );
}
