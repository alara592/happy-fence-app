"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { useCached } from "@/lib/cache";
import { fmtUSD } from "@/lib/format";
import type { GatePriceRow } from "@/lib/pricing";

export interface GateLite {
  id: string;
  type: string;
  style: string;
  actual_price: number;
  quantity: number;
}

interface Props {
  projectId: string;
  open: boolean;
  onClose: () => void;
  /** Current gate rows from the bundle — drive the qty badges and find-or-bump. */
  gates: GateLite[];
  gatesTotal: number;
  activeType: string | null;
  /** Reload the bundle; awaited after each tap so badges/subtotal stay true. */
  onChanged: () => Promise<unknown>;
}

/** Material keyword of a fence type — "Vinyl - Privacy - White" → "vinyl". */
const keyword = (fenceType: string) => fenceType.split("-")[0].trim().toLowerCase();

/**
 * Add-gates sheet (Anthony's sketch, 2026-06-11): one card per gate type — full
 * name as the header, big Single/Double price buttons beneath. Tap = add one,
 * tap again = one more (duplicates merge into quantity on one row, auto-named by
 * type), − takes one away (row deleted at zero). Gate types matching the active
 * fence material sort first (keyword match — soft ordering, nothing hidden).
 * Catalog prices are flat lookups by design; the gates subtotal runs in the header.
 */
export default function QuickAddGate({
  projectId,
  open,
  onClose,
  gates,
  gatesTotal,
  activeType,
  onChanged,
}: Props) {
  const { data: ref } = useCached<{ gatePrices: GatePriceRow[] }>("/api/reference");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  // Group the (type, style, price) catalog into one card per type, keeping order.
  const cards: { type: string; styles: { style: "Single" | "Double"; price: number }[] }[] = [];
  for (const g of ref?.gatePrices ?? []) {
    let c = cards.find((x) => x.type === g.type);
    if (!c) cards.push((c = { type: g.type, styles: [] }));
    c.styles.push({ style: g.style, price: g.price });
  }
  // Single first — the common case; the catalog's row order isn't guaranteed.
  for (const c of cards) c.styles.sort((a, b) => (a.style === "Single" ? 0 : 1) - (b.style === "Single" ? 0 : 1));
  const kw = activeType ? keyword(activeType) : null;
  const matches = (t: string) => !!kw && t.toLowerCase().includes(kw);
  const sorted = kw ? [...cards].sort((a, b) => Number(matches(b.type)) - Number(matches(a.type))) : cards;
  const matchedCount = kw ? sorted.filter((c) => matches(c.type)).length : 0;

  const qtyOf = (type: string, style: string) =>
    gates.filter((g) => g.type === type && g.style === style).reduce((s, g) => s + g.quantity, 0);
  const rowOf = (type: string, style: string) =>
    gates.find((g) => g.type === type && g.style === style);

  function close() {
    setError("");
    onClose();
  }

  async function run(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const add = (type: string, style: string) =>
    run(async () => {
      const row = rowOf(type, style);
      if (row) {
        await api(`/api/projects/${projectId}/gates/${row.id}`, {
          method: "PATCH",
          body: JSON.stringify({ quantity: row.quantity + 1 }),
        });
      } else {
        await api(`/api/projects/${projectId}/gates`, {
          method: "POST",
          body: JSON.stringify({ name: type, description: "", type, style, quantity: 1 }),
        });
      }
    });

  const remove = (type: string, style: string) =>
    run(async () => {
      const row = rowOf(type, style);
      if (!row) return;
      if (row.quantity > 1) {
        await api(`/api/projects/${projectId}/gates/${row.id}`, {
          method: "PATCH",
          body: JSON.stringify({ quantity: row.quantity - 1 }),
        });
      } else {
        await api(`/api/projects/${projectId}/gates/${row.id}`, { method: "DELETE" });
      }
    });

  return (
    <div className="qa-overlay" onClick={close}>
      <div className="qa-panel" onClick={(e) => e.stopPropagation()}>
        <div className="qa-grip" />
        <div className="gc-head">
          <div className="qa-title" style={{ textAlign: "left", margin: 0 }}>Add gates</div>
          <div>Gates: <strong>{fmtUSD(gatesTotal)}</strong></div>
        </div>
        {matchedCount > 0 && (
          <p className="muted" style={{ margin: "3px 0 0" }}>
            {kw!.charAt(0).toUpperCase() + kw!.slice(1)} gates first — matches your active fence.
          </p>
        )}

        {sorted.length === 0 && <p className="muted">Loading gate prices…</p>}
        <div className="gc-list">
          {sorted.map((c, i) => (
            <div key={c.type}>
              {matchedCount > 0 && i === matchedCount && matchedCount < sorted.length && (
                <div className="gc-divider">Other gates</div>
              )}
              <div className="gc-card">
                <div className="gc-name">{c.type}</div>
                <div className="gc-btns">
                  {c.styles.map((s) => {
                    const q = qtyOf(c.type, s.style);
                    return (
                      <button
                        key={s.style}
                        type="button"
                        className={`gc-btn${q ? " on" : ""}`}
                        disabled={busy}
                        onClick={() => add(c.type, s.style)}
                      >
                        <span className="l">{q ? "✓ " : ""}{s.style}</span>
                        <span className="p">{fmtUSD(s.price)}</span>
                        {q > 1 && <span className="gc-qty">×{q}</span>}
                        {q > 0 && (
                          <span
                            className="gc-minus"
                            onClick={(e) => {
                              e.stopPropagation();
                              remove(c.type, s.style);
                            }}
                          >
                            −
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>

        {error && <p className="error">{error}</p>}

        <div className="qa-btns">
          <button type="button" className="primary" onClick={close}>Done</button>
        </div>
        <div style={{ marginTop: 8, textAlign: "center" }}>
          <Link className="qa-more" href={`/projects/${projectId}/gates/new`}>
            More options →
          </Link>
        </div>
      </div>
    </div>
  );
}
