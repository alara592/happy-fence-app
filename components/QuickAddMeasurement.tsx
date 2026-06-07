"use client";

import { useState } from "react";
import { api } from "@/lib/client";

interface Props {
  projectId: string;
  open: boolean;
  onClose: () => void;
  /** Called after each successful save (parent refreshes the cache + flashes a toast). */
  onSaved: () => void;
}

const EMPTY = { name: "", ft: "", tearDown: true, dump: false };

/**
 * In-flow quick-add for a measurement. Responsive: bottom sheet on phones, centered
 * modal on desktop (CSS only — see .qa-* in globals.css). Covers the everyday case
 * (name + ft + tear-down/dump); per-run rate overrides live on the full Edit screen.
 */
export default function QuickAddMeasurement({ projectId, open, onClose, onSaved }: Props) {
  const [v, setV] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const valid = v.name.trim() !== "" && Number(v.ft) > 0;

  function close() {
    setV(EMPTY);
    setError("");
    onClose();
  }

  async function save(addAnother: boolean) {
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    const ft = Number(v.ft);
    try {
      await api(`/api/projects/${projectId}/sections`, {
        method: "POST",
        body: JSON.stringify({
          name: v.name.trim(),
          description: "",
          linear_ft: ft,
          tear_down: v.tearDown,
          dump: v.dump,
          take_down_ft: v.tearDown || v.dump ? ft : 0, // mirrors footage (full Edit for overrides)
          tear_down_rate: null,
          dump_rate: null,
        }),
      });
      onSaved();
      setV(EMPTY);
      if (!addAnother) onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="qa-overlay" onClick={close}>
      <div className="qa-panel" onClick={(e) => e.stopPropagation()}>
        <div className="qa-grip" />
        <div className="qa-title">Add measurement</div>

        <input
          autoFocus
          type="text"
          placeholder="Name (e.g. Side)"
          value={v.name}
          onChange={(e) => setV((p) => ({ ...p, name: e.target.value }))}
        />

        <label>Linear Ft</label>
        <input
          type="number"
          step="any"
          min="0"
          inputMode="decimal"
          placeholder="Ft"
          value={v.ft}
          onChange={(e) => setV((p) => ({ ...p, ft: e.target.value }))}
        />

        <div className="qa-toggles">
          <button
            type="button"
            className={`qa-toggle${v.tearDown ? " on" : ""}`}
            onClick={() => setV((p) => ({ ...p, tearDown: !p.tearDown }))}
          >
            {v.tearDown ? "✓ " : ""}Tear Down
          </button>
          <button
            type="button"
            className={`qa-toggle${v.dump ? " on" : ""}`}
            onClick={() => setV((p) => ({ ...p, dump: !p.dump }))}
          >
            {v.dump ? "✓ " : ""}Dump
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        <div className="qa-btns">
          <button type="button" onClick={() => save(true)} disabled={!valid || busy}>
            Save &amp; add another
          </button>
          <button type="button" className="primary" onClick={() => save(false)} disabled={!valid || busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
        <div style={{ marginTop: 8, textAlign: "center" }}>
          <button type="button" onClick={close} style={{ border: 0, background: "none", color: "#666" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
