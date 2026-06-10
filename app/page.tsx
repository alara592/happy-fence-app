"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCached, prefetch } from "@/lib/cache";
import { fmtDate, mapsUrl } from "@/lib/format";

interface ProjectListItem {
  id: string;
  client: string;
  address: string | null;
  date: string;
  permit: boolean;
  created_at: string;
  updated_at: string;
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

/** Screen 2 — project list: search + creation grouping. No totals (price-board model). */
export default function ProjectListPage() {
  const { data: projects, error } = useCached<ProjectListItem[]>("/api/projects");
  const [q, setQ] = useState("");

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
    return { by, count: filtered.length };
  }, [projects, q]);

  return (
    <>
      <div className="spread">
        <h1>Projects</h1>
        <div className="actions">
          <Link href="/appointments">
            <button>Appointments</button>
          </Link>
          <Link href="/projects/new">
            <button className="primary">+ New</button>
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

      {error && !projects && <p className="error">{error.message}</p>}
      {!projects && !error && <p className="muted">Loading…</p>}
      {projects?.length === 0 && <p className="muted">No projects yet.</p>}
      {grouped && projects && projects.length > 0 && grouped.count === 0 && (
        <p className="muted">No matches.</p>
      )}

      {grouped &&
        GROUPS.map((g) =>
          grouped.by[g].length === 0 ? null : (
            <div key={g}>
              <div className="group-h">{g}</div>
              {grouped.by[g].map((p) => (
                <div key={p.id} className="card spread">
                  <Link
                    href={`/projects/${p.id}`}
                    style={{ textDecoration: "none", color: "inherit", flex: 1 }}
                  >
                    <strong>{p.client}</strong>
                    <div className="muted">
                      {city(p.address) || "—"} · {fmtDate(p.date)}
                      {p.permit ? " · Permit" : ""}
                    </div>
                  </Link>
                  <div className="actions" style={{ margin: 0, alignItems: "center" }}>
                    {p.address && (
                      <a
                        className="pin"
                        href={mapsUrl(p.address)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Directions"
                      >
                        📍
                      </a>
                    )}
                    <Link href={`/projects/${p.id}`} className="muted" style={{ textDecoration: "none" }}>
                      ›
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ),
        )}
    </>
  );
}
