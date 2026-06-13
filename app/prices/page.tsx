"use client";

import { useState } from "react";
import { useCached, load } from "@/lib/cache";
import { api } from "@/lib/client";
import { useIsDesktop } from "@/lib/useIsDesktop";

interface FenceRowT { type: string; perSection: number; ftPerSection: number }
interface GateRowT { type: string; style: "Single" | "Double"; price: number }
interface Reference {
  fencePrices: FenceRowT[];
  gatePrices: GateRowT[];
  settings: { defaultTearDownRate: number; defaultDumpRate: number; permitFee: number };
  defaults?: { laborCostFt: number; profitMargin: number };
}

const REF_KEY = "/api/reference";

/**
 * Prices tab (desktop-only) — edit the fence/gate catalogs + global settings in-app.
 * Editing a price changes LIVE prices; existing quotes stay frozen by their snapshot and
 * surface the "prices changed" banner. Type rename + reordering are deferred (rename would
 * need to rewrite every project's frozen snapshot).
 */
export default function PricesPage() {
  const desktop = useIsDesktop();
  const { data: ref, error: loadErr } = useCached<Reference>(REF_KEY);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  const reload = () => load<Reference>(REF_KEY).catch(() => {});
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 1600); };
  async function run(fn: () => Promise<unknown>, okMsg = "Saved ✓") {
    setErr("");
    try { await fn(); await reload(); flash(okMsg); }
    catch (e) { setErr((e as Error).message); }
  }
  const patchSettings = (payload: Record<string, number>) =>
    run(() => api("/api/prices/settings", { method: "PATCH", body: JSON.stringify(payload) }));

  if (!desktop) {
    return <p className="muted" style={{ padding: 16 }}>Open <strong>Prices</strong> on a desktop to edit the price tables.</p>;
  }
  if (loadErr && !ref) return <p className="error">{loadErr.message}</p>;
  if (!ref) return <p className="muted">Loading…</p>;

  return (
    <>
      {toast && <div className="toast">{toast}</div>}
      <h1>Prices</h1>
      <p className="muted" style={{ margin: "0 0 8px", maxWidth: 640 }}>
        Editing a price re-quotes new jobs right away. Existing quotes stay frozen at what they
        were made under — they show an “update or keep” prompt when you open them.
      </p>
      {err && <p className="error">{err}</p>}

      <h2>Settings</h2>
      <div className="pr-settings">
        <SettingField label="Default labor" suffix="$/ft" value={ref.defaults?.laborCostFt ?? 12}
          onSave={(v) => patchSettings({ default_labor_cost_ft: v })} />
        <SettingField label="Default margin" suffix="%" value={(ref.defaults?.profitMargin ?? 0.3) * 100}
          onSave={(v) => patchSettings({ default_margin: v / 100 })} />
        <SettingField label="Permit fee" suffix="$" value={ref.settings.permitFee}
          onSave={(v) => patchSettings({ permit_fee: v })} />
        <SettingField label="Tear-down rate" suffix="$/ft" value={ref.settings.defaultTearDownRate}
          onSave={(v) => patchSettings({ default_tear_down_rate: v })} />
        <SettingField label="Dump rate" suffix="$/ft" value={ref.settings.defaultDumpRate}
          onSave={(v) => patchSettings({ default_dump_rate: v })} />
      </div>

      <h2 style={{ marginTop: 28 }}>Fence catalog <span className="pr-count">{ref.fencePrices.length}</span></h2>
      <div className="pr-grid pr-head"><span>Type</span><span>$ / section</span><span>Ft / section</span><span /></div>
      {ref.fencePrices.map((f) => (
        <FenceRow key={`${f.type}|${f.perSection}|${f.ftPerSection}`} row={f}
          onPatch={(payload) => run(() => api("/api/prices/fences", { method: "PATCH", body: JSON.stringify({ type: f.type, ...payload }) }))}
          onDelete={() => run(() => api(`/api/prices/fences?type=${encodeURIComponent(f.type)}`, { method: "DELETE" }), "Deleted")} />
      ))}
      <AddFence onAdd={(p) => run(() => api("/api/prices/fences", { method: "POST", body: JSON.stringify(p) }), "Added ✓")} />

      <h2 style={{ marginTop: 28 }}>Gate catalog <span className="pr-count">{ref.gatePrices.length}</span></h2>
      <div className="pr-grid pr-head"><span>Type</span><span>Style</span><span>Price</span><span /></div>
      {ref.gatePrices.map((g) => (
        <GateRow key={`${g.type}|${g.style}|${g.price}`} row={g}
          onPatch={(price) => run(() => api("/api/prices/gates", { method: "PATCH", body: JSON.stringify({ type: g.type, style: g.style, price }) }))}
          onDelete={() => run(() => api(`/api/prices/gates?type=${encodeURIComponent(g.type)}&style=${g.style}`, { method: "DELETE" }), "Deleted")} />
      ))}
      <AddGate onAdd={(p) => run(() => api("/api/prices/gates", { method: "POST", body: JSON.stringify(p) }), "Added ✓")} />
    </>
  );
}

function SettingField({ label, suffix, value, onSave }: { label: string; suffix: string; value: number; onSave: (v: number) => void }) {
  return (
    <label className="pr-set" key={`${label}|${value}`}>
      <span>{label}</span>
      <span className="pr-inp">
        <input type="number" step="any" inputMode="decimal" defaultValue={value}
          onBlur={(e) => { const v = Number(e.target.value); if (e.target.value !== "" && !Number.isNaN(v) && v !== value) onSave(v); }} />
        <em>{suffix}</em>
      </span>
    </label>
  );
}

function FenceRow({ row, onPatch, onDelete }: {
  row: FenceRowT; onPatch: (p: { perSection?: number; ftPerSection?: number }) => void; onDelete: () => void;
}) {
  return (
    <div className="pr-grid">
      <span className="pr-type">{row.type}{row.perSection === 0 && <span className="pr-unpriced"> · unpriced</span>}</span>
      <span className="pr-inp"><em>$</em>
        <input type="number" step="any" inputMode="decimal" defaultValue={row.perSection}
          onBlur={(e) => { const v = Number(e.target.value); if (e.target.value !== "" && v >= 0 && v !== row.perSection) onPatch({ perSection: v }); }} />
      </span>
      <span className="pr-inp">
        <input type="number" step="any" inputMode="decimal" defaultValue={row.ftPerSection}
          onBlur={(e) => { const v = Number(e.target.value); if (v > 0 && v !== row.ftPerSection) onPatch({ ftPerSection: v }); }} />
        <em>ft</em>
      </span>
      <button className="danger" title="Delete type" onClick={onDelete}>✕</button>
    </div>
  );
}

function GateRow({ row, onPatch, onDelete }: { row: GateRowT; onPatch: (price: number) => void; onDelete: () => void }) {
  return (
    <div className="pr-grid">
      <span className="pr-type">{row.type}</span>
      <span>{row.style}</span>
      <span className="pr-inp"><em>$</em>
        <input type="number" step="any" inputMode="decimal" defaultValue={row.price}
          onBlur={(e) => { const v = Number(e.target.value); if (e.target.value !== "" && v >= 0 && v !== row.price) onPatch(v); }} />
      </span>
      <button className="danger" title="Delete gate" onClick={onDelete}>✕</button>
    </div>
  );
}

function AddFence({ onAdd }: { onAdd: (p: { type: string; perSection: number; ftPerSection: number }) => void }) {
  const [type, setType] = useState("");
  const [ps, setPs] = useState("");
  const [ft, setFt] = useState("");
  const submit = () => {
    if (!type.trim() || !(Number(ft) > 0)) return;
    onAdd({ type: type.trim(), perSection: Number(ps || 0), ftPerSection: Number(ft) });
    setType(""); setPs(""); setFt("");
  };
  return (
    <div className="pr-grid pr-add">
      <input placeholder="New fence type — e.g. Wood - Horizontal" value={type} onChange={(e) => setType(e.target.value)} />
      <span className="pr-inp"><em>$</em><input type="number" placeholder="0" value={ps} onChange={(e) => setPs(e.target.value)} /></span>
      <span className="pr-inp"><input type="number" placeholder="6" value={ft} onChange={(e) => setFt(e.target.value)} /><em>ft</em></span>
      <button className="secondary" onClick={submit}>+ Add</button>
    </div>
  );
}

function AddGate({ onAdd }: { onAdd: (p: { type: string; style: "Single" | "Double"; price: number }) => void }) {
  const [type, setType] = useState("");
  const [style, setStyle] = useState<"Single" | "Double">("Single");
  const [price, setPrice] = useState("");
  const submit = () => {
    if (!type.trim() || price === "" || !(Number(price) >= 0)) return;
    onAdd({ type: type.trim(), style, price: Number(price) });
    setType(""); setPrice("");
  };
  return (
    <div className="pr-grid pr-add">
      <input placeholder="New gate type" value={type} onChange={(e) => setType(e.target.value)} />
      <select value={style} onChange={(e) => setStyle(e.target.value as "Single" | "Double")}>
        <option>Single</option>
        <option>Double</option>
      </select>
      <span className="pr-inp"><em>$</em><input type="number" placeholder="0" value={price} onChange={(e) => setPrice(e.target.value)} /></span>
      <button className="secondary" onClick={submit}>+ Add</button>
    </div>
  );
}
