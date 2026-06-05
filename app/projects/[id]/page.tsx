"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { fmtUSD, fmtDate } from "@/lib/format";

interface Bundle {
  project: {
    id: string;
    client: string;
    address: string | null;
    date: string;
    permit: boolean;
    labor_cost_ft: number;
    profit_margin: number;
    discount: number;
    notes: string | null;
    price_mod_notes: string | null;
  };
  sections: {
    id: string;
    name: string;
    linear_ft: number;
    tear_down: boolean;
    dump: boolean;
    take_down_ft: number;
  }[];
  gates: { id: string; name: string; type: string; style: string; actual_price: number }[];
  extras: { id: string; name: string; price: number }[];
  materials: { id: string; type: string; is_active: boolean }[];
  board: { materialId: string; type: string; total: number | null; unpriced: boolean; active: boolean }[];
  gatesTotal: number;
  activeType: string | null;
  total: number | null;
  totalLinearFt: number;
}

interface FencePriceRow {
  type: string;
  perSection: number;
}

/** Screen 4 — project: measurements + the price board (whole job per material). */
export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [b, setB] = useState<Bundle | null>(null);
  const [allTypes, setAllTypes] = useState<FencePriceRow[] | null>(null);
  const [pick, setPick] = useState("");
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    api<Bundle>(`/api/projects/${id}`).then(setB).catch((e) => setError(e.message));
  }, [id]);

  useEffect(reload, [reload]);
  useEffect(() => {
    api<{ fencePrices: FencePriceRow[] }>("/api/reference")
      .then((r) => setAllTypes(r.fencePrices))
      .catch((e) => setError(e.message));
  }, []);

  async function addMaterial(type: string) {
    if (!type) return;
    setPick("");
    try {
      await api(`/api/projects/${id}/materials`, {
        method: "POST",
        body: JSON.stringify({ type }),
      });
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function del(path: string, label: string) {
    if (!confirm(`Delete ${label}?`)) return;
    try {
      await api(path, { method: "DELETE" });
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removeMaterial(materialId: string) {
    try {
      await api(`/api/projects/${id}/materials/${materialId}`, { method: "DELETE" });
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function setActive(materialId: string) {
    try {
      await api(`/api/projects/${id}/materials/${materialId}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: true }),
      });
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function delProject() {
    if (!confirm(`Delete this project AND all its sections, gates, extras, and materials?`)) return;
    try {
      await api(`/api/projects/${id}`, { method: "DELETE" });
      router.push("/");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (error && !b) return <p className="error">{error}</p>;
  if (!b) return <p className="muted">Loading…</p>;
  const { project: p } = b;
  const onBoard = new Set(b.materials.map((m) => m.type));
  const available = (allTypes ?? []).filter((t) => !onBoard.has(t.type));

  return (
    <>
      <p><Link href="/">← Projects</Link></p>
      <div className="spread">
        <h1 style={{ margin: 0 }}>{p.client}</h1>
        <Link href={`/projects/${id}/edit`}><button>Edit</button></Link>
      </div>
      <p className="muted">
        {p.address || "No address"} · {fmtDate(p.date)} · {p.permit ? "Permit" : "No permit"} ·
        labor {fmtUSD(p.labor_cost_ft)}/ft · margin {(p.profit_margin * 100).toFixed(0)}%
        {p.discount !== 0 ? ` · adj ${fmtUSD(p.discount)}` : ""}
      </p>
      {p.notes && <p className="muted">Notes: {p.notes}</p>}
      {p.price_mod_notes && <p className="muted">Price mods: {p.price_mod_notes}</p>}
      {error && <p className="error">{error}</p>}

      <div className="card">
        <div className="spread">
          <span>Project Total</span>
          <span className="total">{b.total !== null ? fmtUSD(b.total) : "—"}</span>
        </div>
        <div className="muted">
          {b.activeType
            ? `${b.activeType} (active) + gates ${fmtUSD(b.gatesTotal)}`
            : "Set an Active fence on the price board to get the project total."}
        </div>
      </div>

      <div className="spread">
        <h2>Sections ({b.sections.length}) — {b.totalLinearFt} ft</h2>
        <Link href={`/projects/${id}/sections/new`}><button>+ Add</button></Link>
      </div>
      {b.sections.map((s) => (
        <div key={s.id} className="card">
          <div className="spread">
            <div>
              <strong>{s.name}</strong>
              <div className="muted">
                {s.linear_ft} ft
                {s.tear_down ? ` · tear-down ${s.take_down_ft} ft` : ""}
                {s.dump ? " · dump" : ""}
              </div>
            </div>
            <div className="actions" style={{ margin: 0 }}>
              <Link href={`/projects/${id}/sections/${s.id}`}><button>Edit</button></Link>
              <button className="danger" onClick={() => del(`/api/projects/${id}/sections/${s.id}`, `section "${s.name}"`)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      ))}
      {b.sections.length === 0 && <p className="muted">No sections measured yet.</p>}

      <h2>Price board <span className="muted" style={{ fontWeight: 400 }}>(fence + permit + extras, no gates)</span></h2>
      {b.board.map((row) => (
        <div
          key={row.materialId}
          className="card spread"
          style={row.active ? { borderColor: "#1a7f37", borderWidth: 2 } : undefined}
        >
          <div>
            <strong>{row.type}</strong>
            {row.active && <div className="muted" style={{ color: "#1a7f37" }}>Active fence</div>}
            {row.unpriced && (
              <div className="warn" style={{ margin: "4px 0 0" }}>
                Unpriced material — no $/section on file. Update the price table before quoting.
              </div>
            )}
          </div>
          <div className="row" style={{ flex: "none", gap: 8 }}>
            {row.total !== null && <span className="total">{fmtUSD(row.total)}</span>}
            {!row.active && (
              <button onClick={() => setActive(row.materialId)}>Set active</button>
            )}
            <button className="danger" onClick={() => removeMaterial(row.materialId)}>✕</button>
          </div>
        </div>
      ))}
      {b.board.length === 0 && <p className="muted">No materials on the board yet — add one below.</p>}
      <select
        value={pick}
        onChange={(e) => addMaterial(e.target.value)}
        disabled={!allTypes || available.length === 0}
      >
        <option value="" disabled>
          {allTypes ? "+ Add material…" : "Loading materials…"}
        </option>
        {available.map((t) => (
          <option key={t.type} value={t.type}>
            {t.type}
            {t.perSection === 0 ? " (UNPRICED)" : ""}
          </option>
        ))}
      </select>

      <div className="spread">
        <h2>Gates ({b.gates.length})</h2>
        <Link href={`/projects/${id}/gates/new`}><button>+ Add</button></Link>
      </div>
      {b.gates.map((g) => (
        <div key={g.id} className="card">
          <div className="spread">
            <div>
              <strong>{g.name}</strong>
              <div className="muted">{g.type} · {g.style}</div>
            </div>
            <strong>{fmtUSD(g.actual_price)}</strong>
          </div>
          <div className="actions">
            <Link href={`/projects/${id}/gates/${g.id}`}><button>Edit</button></Link>
            <button className="danger" onClick={() => del(`/api/projects/${id}/gates/${g.id}`, `gate "${g.name}"`)}>
              Delete
            </button>
          </div>
        </div>
      ))}

      <div className="spread">
        <h2>Extras ({b.extras.length})</h2>
        <Link href={`/projects/${id}/extras/new`}><button>+ Add</button></Link>
      </div>
      {b.extras.map((x) => (
        <div key={x.id} className="card spread">
          <div>
            <strong>{x.name}</strong>
          </div>
          <div className="row" style={{ flex: "none", gap: 12 }}>
            <strong>{fmtUSD(x.price)}</strong>
            <button className="danger" onClick={() => del(`/api/projects/${id}/extras/${x.id}`, `extra "${x.name}"`)}>
              Delete
            </button>
          </div>
        </div>
      ))}

      <h2>Danger zone</h2>
      <button className="danger" onClick={delProject}>Delete Project</button>
    </>
  );
}
