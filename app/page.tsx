"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { fmtDate, mapsUrl } from "@/lib/format";

interface ProjectListItem {
  id: string;
  client: string;
  address: string | null;
  date: string;
  permit: boolean;
}

/** City = tail of the address; good enough for the list line. */
function city(address: string | null): string {
  if (!address) return "";
  const parts = address.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts[1] : "";
}

const GROUPS = ["This week", "Upcoming", "Earlier"] as const;
type Group = (typeof GROUPS)[number];

/** Bucket a job date relative to today (This week = today → end of week). */
function bucket(dateStr: string): Group {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (date < today) return "Earlier";
  const endOfWeek = new Date(today);
  endOfWeek.setDate(today.getDate() + ((7 - today.getDay()) % 7)); // upcoming Sunday (today if Sunday)
  return date <= endOfWeek ? "This week" : "Upcoming";
}

/** Screen 2 — project list: search + date grouping. No totals (price-board model). */
export default function ProjectListPage() {
  const [projects, setProjects] = useState<ProjectListItem[] | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    api<ProjectListItem[]>("/api/projects").then(setProjects).catch((e) => setError(e.message));
  }, []);

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
    const by: Record<Group, ProjectListItem[]> = { "This week": [], Upcoming: [], Earlier: [] };
    for (const p of filtered) by[bucket(p.date)].push(p);
    // soonest first for current/future; most recent first for past
    by["This week"].sort((a, b) => a.date.localeCompare(b.date));
    by.Upcoming.sort((a, b) => a.date.localeCompare(b.date));
    by.Earlier.sort((a, b) => b.date.localeCompare(a.date));
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

      {error && <p className="error">{error}</p>}
      {projects === null && !error && <p className="muted">Loading…</p>}
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
