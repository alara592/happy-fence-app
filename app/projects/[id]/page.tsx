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
    type: string;
    linear_ft: number;
    tear_down: boolean;
    dump: boolean;
    actual_price: number;
  }[];
  gates: { id: string; name: string; type: string; style: string; actual_price: number }[];
  extras: { id: string; name: string; price: number }[];
  breakdown: {
    sectionsTotal: number;
    permitFee: number;
    gatesTotal: number;
    discount: number;
    extrasTotal: number;
    total: number;
    unmatchedGateTypes: string[];
  };
}

/** Screen 4 — project detail: header, Project Total, children, add/edit/delete. */
export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [b, setB] = useState<Bundle | null>(null);
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    api<Bundle>(`/api/projects/${id}`).then(setB).catch((e) => setError(e.message));
  }, [id]);

  useEffect(reload, [reload]);

  async function del(path: string, label: string) {
    if (!confirm(`Delete ${label}?`)) return;
    try {
      await api(path, { method: "DELETE" });
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function delProject() {
    if (!confirm(`Delete this project AND all its sections, gates, and extras?`)) return;
    try {
      await api(`/api/projects/${id}`, { method: "DELETE" });
      router.push("/");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (error) return <p className="error">{error}</p>;
  if (!b) return <p className="muted">Loading…</p>;
  const { project: p, breakdown: t } = b;

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
      </p>
      {p.notes && <p className="muted">Notes: {p.notes}</p>}
      {p.price_mod_notes && <p className="muted">Price mods: {p.price_mod_notes}</p>}

      <div className="card">
        <div className="spread">
          <span>Project Total</span>
          <span className="total">{fmtUSD(t.total)}</span>
        </div>
        <div className="muted">
          Sections {fmtUSD(t.sectionsTotal)} · Permit {fmtUSD(t.permitFee)} · Gates{" "}
          {fmtUSD(t.gatesTotal)} · Discount {fmtUSD(t.discount)} · Extras {fmtUSD(t.extrasTotal)}
        </div>
      </div>
      {t.unmatchedGateTypes.length > 0 && (
        <div className="warn">⚠ No price found for gate(s): {t.unmatchedGateTypes.join(", ")}</div>
      )}

      <div className="spread">
        <h2>Sections ({b.sections.length})</h2>
        <Link href={`/projects/${id}/sections/new`}><button>+ Add</button></Link>
      </div>
      {b.sections.map((s) => (
        <div key={s.id} className="card">
          <div className="spread">
            <div>
              <strong>{s.name}</strong>
              <div className="muted">
                {s.type} · {s.linear_ft} ft
                {s.tear_down ? " · tear-down" : ""}
                {s.dump ? " · dump" : ""}
              </div>
            </div>
            <strong>{fmtUSD(s.actual_price)}</strong>
          </div>
          <div className="actions">
            <Link href={`/projects/${id}/sections/${s.id}`}><button>Edit</button></Link>
            <button className="danger" onClick={() => del(`/api/projects/${id}/sections/${s.id}`, `section "${s.name}"`)}>
              Delete
            </button>
          </div>
        </div>
      ))}

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
