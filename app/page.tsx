"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { fmtUSD, fmtDate } from "@/lib/format";

interface ProjectListItem {
  id: string;
  client: string;
  address: string | null;
  date: string;
  permit: boolean;
  total: number;
}

/** City = tail of the address; good enough for the list line (spec §3.2). */
function city(address: string | null): string {
  if (!address) return "";
  const parts = address.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts[1] : "";
}

/** Screen 2 — project list, newest first. */
export default function ProjectListPage() {
  const [projects, setProjects] = useState<ProjectListItem[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<ProjectListItem[]>("/api/projects").then(setProjects).catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <div className="spread">
        <h1>Projects</h1>
        <Link href="/projects/new">
          <button className="primary">+ New Project</button>
        </Link>
      </div>
      {error && <p className="error">{error}</p>}
      {projects === null && !error && <p className="muted">Loading…</p>}
      {projects?.length === 0 && <p className="muted">No projects yet.</p>}
      {projects?.map((p) => (
        <Link key={p.id} href={`/projects/${p.id}`} style={{ textDecoration: "none", color: "inherit" }}>
          <div className="card spread">
            <div>
              <strong>{p.client}</strong>
              <div className="muted">
                {city(p.address) || "—"} · {fmtDate(p.date)} · {p.permit ? "Permit" : "No permit"}
              </div>
            </div>
            <div style={{ fontWeight: 700 }}>{fmtUSD(p.total)}</div>
          </div>
        </Link>
      ))}
    </>
  );
}
