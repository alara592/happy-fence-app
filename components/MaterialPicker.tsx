"use client";

import { useState } from "react";
import { fmtUSD } from "@/lib/format";

export interface CatalogRow {
  type: string;
  perSection: number;
  total: number | null;
  unpriced: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** bundle.catalog — the whole catalog priced for this job (server-computed). */
  catalog: CatalogRow[];
  /** type → board materialId for types already on the board. */
  onBoard: Map<string, string>;
  activeType: string | null;
  activeTotal: number | null;
  onAdd: (type: string) => Promise<void>;
  onRemove: (materialId: string) => Promise<void>;
}

/**
 * Add-material picker: the whole catalog with this job's total next to each material,
 * cheapest first (toggle to catalog order), delta vs the Active fence on every other
 * row. Tap to put a material on the board, tap again to take it off — so "what would
 * it cost in X?" is answerable without board churn. Same responsive sheet pattern as
 * the quick-adds (.qa-* in globals.css).
 */
export default function MaterialPicker({
  open,
  onClose,
  catalog,
  onBoard,
  activeType,
  activeTotal,
  onAdd,
  onRemove,
}: Props) {
  const [cheapest, setCheapest] = useState(true);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const rows = cheapest
    ? [...catalog].sort((a, b) => (a.total ?? Infinity) - (b.total ?? Infinity))
    : catalog;

  async function toggle(row: CatalogRow) {
    if (busy) return;
    setBusy(true);
    try {
      const id = onBoard.get(row.type);
      if (id) await onRemove(id);
      else await onAdd(row.type);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="qa-overlay" onClick={onClose}>
      <div className="qa-panel" onClick={(e) => e.stopPropagation()}>
        <div className="qa-grip" />
        <div className="mp-head">
          <div className="qa-title" style={{ textAlign: "left", margin: 0 }}>Add material</div>
          <button type="button" className="mp-sort" onClick={() => setCheapest((c) => !c)}>
            {cheapest ? "Cheapest first" : "Catalog order"} ⇅
          </button>
        </div>
        <p className="muted" style={{ margin: "4px 0 6px" }}>
          This job under every material — tap to add to the board, tap again to remove.
        </p>

        {rows.length === 0 && <p className="muted">Loading prices…</p>}
        <div className="mp-list">
          {rows.map((r) => {
            const on = onBoard.has(r.type);
            const delta =
              r.total !== null && activeTotal !== null && r.type !== activeType
                ? r.total - activeTotal
                : null;
            return (
              <button
                key={r.type}
                type="button"
                className={`mp-row${on ? " on" : ""}`}
                disabled={busy}
                onClick={() => toggle(r)}
              >
                <span className="mp-name">{on ? "✓ " : "+ "}{r.type}</span>
                <span className="mp-price">
                  {r.unpriced ? (
                    <span className="mp-unpriced">unpriced</span>
                  ) : (
                    <>
                      <strong>{r.total !== null ? fmtUSD(r.total) : "—"}</strong>
                      {delta !== null && delta !== 0 && (
                        <span
                          className="mp-delta"
                          style={delta < 0 ? { color: "var(--brand)" } : undefined}
                        >
                          {delta > 0 ? "+" : "−"}{fmtUSD(Math.abs(delta))}
                        </span>
                      )}
                    </>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <div className="qa-btns">
          <button type="button" className="primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
