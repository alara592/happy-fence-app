"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { fmtUSD, fmtDate, mapsUrl, earthUrl } from "@/lib/format";

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
    price: number | null;
  }[];
  gates: { id: string; name: string; type: string; style: string; actual_price: number; quantity: number }[];
  extras: { id: string; name: string; price: number }[];
  materials: { id: string; type: string; is_active: boolean }[];
  board: { materialId: string; type: string; total: number | null; unpriced: boolean; active: boolean }[];
  gatesTotal: number;
  activeType: string | null;
  total: number | null;
  totalLinearFt: number;
  fencePrices: { type: string; perSection: number }[];
}

/** Screen 4 — project: measurements + the price board (whole job per material). */
export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [b, setB] = useState<Bundle | null>(null);
  const [pick, setPick] = useState("");
  const [error, setError] = useState("");
  const [discount, setDiscount] = useState("");
  const [toast, setToast] = useState("");
  const [confirmAsk, setConfirmAsk] = useState<{ message: string; run: () => void } | null>(null);

  const reload = useCallback(() => {
    api<Bundle>(`/api/projects/${id}`)
      .then((bundle) => {
        setB(bundle);
        setDiscount(String(bundle.project.discount));
      })
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(reload, [reload]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 1800);
  }

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

  function del(path: string, label: string) {
    setConfirmAsk({
      message: `Delete ${label}?`,
      run: async () => {
        try {
          await api(path, { method: "DELETE" });
          flash("Deleted");
          reload();
        } catch (e) {
          setError((e as Error).message);
        }
      },
    });
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
      flash("Active fence set");
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function saveDiscount() {
    if (!b) return;
    const next = Number(discount || 0);
    if (next === b.project.discount) return;
    try {
      await api(`/api/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ discount: next }),
      });
      flash("Saved ✓");
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function delProject() {
    setConfirmAsk({
      message: "Delete this project AND all its sections, gates, extras, and materials?",
      run: async () => {
        try {
          await api(`/api/projects/${id}`, { method: "DELETE" });
          router.push("/");
        } catch (e) {
          setError((e as Error).message);
        }
      },
    });
  }

  if (error && !b) return <p className="error">{error}</p>;
  if (!b) return <p className="muted">Loading…</p>;
  const { project: p } = b;
  const onBoard = new Set(b.materials.map((m) => m.type));
  const available = b.fencePrices.filter((t) => !onBoard.has(t.type));
  const perSection = new Map(b.fencePrices.map((t) => [t.type, t.perSection]));
  const activeTotal = b.board.find((r) => r.active)?.total ?? null;

  return (
    <>
      {toast && <div className="toast">{toast}</div>}

      <div className="sticky-total">
        <div>
          <div className="lbl">
            Project Total{b.activeType ? ` · ${b.activeType}` : ""}
          </div>
          <div className="num">{b.total !== null ? fmtUSD(b.total) : "—"}</div>
        </div>
        <Link href={`/projects/${id}/present`}>
          <button className="present-btn">Present →</button>
        </Link>
      </div>

      <div className="spread">
        <h1 style={{ margin: 0 }}>{p.client}</h1>
        <Link href={`/projects/${id}/edit`}><button>Edit</button></Link>
      </div>
      <p className="muted">
        {p.address || "No address"}
        {p.address && (
          <span className="geo">
            <a href={mapsUrl(p.address)} target="_blank" rel="noopener noreferrer" title="Directions">📍</a>
            <a href={earthUrl(p.address)} target="_blank" rel="noopener noreferrer" title="Google Earth">🌐</a>
          </span>
        )}
        <br />
        {fmtDate(p.date)} · {p.permit ? "Permit" : "No permit"} · {(p.profit_margin * 100).toFixed(0)}% | {p.labor_cost_ft}/ft
      </p>
      {p.notes && <p className="muted">Notes: {p.notes}</p>}
      {p.price_mod_notes && <p className="muted">Price mods: {p.price_mod_notes}</p>}
      {error && <p className="error">{error}</p>}
      {!b.activeType && (
        <p className="muted">Set an Active fence on the price board to get the project total.</p>
      )}

      <div className="spread">
        <h2>Measurements ({b.sections.length}) — {b.totalLinearFt} ft</h2>
        <Link href={`/projects/${id}/sections/new`}><button>+ Add</button></Link>
      </div>
      {b.sections.map((s) => (
        <div key={s.id} className="card">
          <div className="spread">
            <div>
              <strong>{s.name}</strong>
              <div className="muted">
                {s.price !== null && <><span className="sec-price">{fmtUSD(s.price)}</span> · </>}
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
      {b.sections.length === 0 && <p className="muted">No measurements yet.</p>}

      <h2>Price board <span className="muted" style={{ fontWeight: 400 }}>(fence + permit + extras, no gates)</span></h2>
      {b.board.map((row) => {
        const ps = perSection.get(row.type);
        const delta =
          !row.active && row.total !== null && activeTotal !== null ? row.total - activeTotal : null;
        return (
          <div
            key={row.materialId}
            className="card spread"
            style={row.active ? { borderColor: "#1a7f37", borderWidth: 2 } : undefined}
          >
            <div>
              <strong>{row.type}</strong>
              {row.active && <div className="muted" style={{ color: "#1a7f37" }}>Active fence</div>}
              {ps !== undefined && ps > 0 && <div className="muted">{fmtUSD(ps)} / section</div>}
              {row.unpriced && (
                <div className="warn" style={{ margin: "4px 0 0" }}>
                  Unpriced material — no $/section on file. Update the price table before quoting.
                </div>
              )}
            </div>
            <div className="row" style={{ flex: "none", gap: 8, textAlign: "right" }}>
              {row.total !== null && (
                <div>
                  <div className="total" style={{ fontSize: "1.3rem" }}>{fmtUSD(row.total)}</div>
                  {delta !== null && delta !== 0 && (
                    <div className="delta">{delta > 0 ? "+" : "−"}{fmtUSD(Math.abs(delta))}</div>
                  )}
                </div>
              )}
              {!row.active && (
                <button onClick={() => setActive(row.materialId)}>Set active</button>
              )}
              <button className="danger" onClick={() => removeMaterial(row.materialId)}>✕</button>
            </div>
          </div>
        );
      })}
      {b.board.length === 0 && <p className="muted">No materials on the board yet — add one below.</p>}
      <select
        value={pick}
        onChange={(e) => addMaterial(e.target.value)}
        disabled={available.length === 0}
      >
        <option value="" disabled>
          + Add material…
        </option>
        {available.map((t) => (
          <option key={t.type} value={t.type}>
            {t.type}
            {t.perSection === 0 ? " (UNPRICED)" : ""}
          </option>
        ))}
      </select>

      {b.gates.length === 0 ? (
        <div className="collapsed">
          Gates (0) — none yet
          <Link href={`/projects/${id}/gates/new`}>+ Add</Link>
        </div>
      ) : (
        <>
          <div className="spread">
            <h2>Gates ({b.gates.length})</h2>
            <Link href={`/projects/${id}/gates/new`}><button>+ Add</button></Link>
          </div>
          {b.gates.map((g) => (
            <div key={g.id} className="card">
              <div className="spread">
                <div>
                  <strong>{g.name}</strong>
                  <div className="muted">
                    {g.type} · {g.style}
                    {g.quantity > 1 ? ` · ${fmtUSD(g.actual_price)} × ${g.quantity}` : ""}
                  </div>
                </div>
                <strong>{fmtUSD(g.actual_price * g.quantity)}</strong>
              </div>
              <div className="actions">
                <Link href={`/projects/${id}/gates/${g.id}`}><button>Edit</button></Link>
                <button className="danger" onClick={() => del(`/api/projects/${id}/gates/${g.id}`, `gate "${g.name}"`)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {b.extras.length === 0 ? (
        <div className="collapsed">
          Extras (0) — none yet
          <Link href={`/projects/${id}/extras/new`}>+ Add</Link>
        </div>
      ) : (
        <>
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
        </>
      )}

      <label htmlFor="discount" style={{ marginTop: 24 }}>Discount $</label>
      <input
        id="discount"
        type="number"
        step="any"
        inputMode="decimal"
        style={{ maxWidth: 200 }}
        value={discount}
        onChange={(e) => setDiscount(e.target.value)}
        onBlur={saveDiscount}
      />
      <p className="muted">Negative = discount off the total.</p>

      <h2>Danger zone</h2>
      <button className="danger" onClick={delProject}>Delete Project</button>

      {confirmAsk && (
        <div className="modal-backdrop" onClick={() => setConfirmAsk(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="body">
              <strong>{confirmAsk.message}</strong>
            </div>
            <div className="btns">
              <button onClick={() => setConfirmAsk(null)}>Cancel</button>
              <button
                style={{ color: "#b02a37", fontWeight: 700 }}
                onClick={() => {
                  const r = confirmAsk.run;
                  setConfirmAsk(null);
                  r();
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
