"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { useCached } from "@/lib/cache";
import { fmtUSD } from "@/lib/format";
import type { GatePriceRow } from "@/lib/pricing";

interface Props {
  projectId: string;
  /** Existing gate count — auto-names the new gate "Gate N". */
  gateCount: number;
  open: boolean;
  onClose: () => void;
  /** Called after a successful save (parent refreshes the cache + flashes a toast). */
  onSaved: () => void;
}

const CHIPS = 8;

/**
 * In-flow quick-add for a gate: one tap on a (type, style) chip adds it (qty 1,
 * auto-named). Chips are the most-used combos per the usage counts on
 * /api/reference; the full form (name/description/quantity + whole catalog)
 * stays at gates/new via "More options". Same responsive sheet pattern as
 * QuickAddMeasurement (.qa-* in globals.css).
 */
export default function QuickAddGate({ projectId, gateCount, open, onClose, onSaved }: Props) {
  const { data: ref } = useCached<{
    gatePrices: GatePriceRow[];
    usage?: { gates: Record<string, number> };
  }>("/api/reference");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const use = ref?.usage?.gates ?? {};
  const chips = [...(ref?.gatePrices ?? [])]
    .sort((a, b) => (use[`${b.type}|${b.style}`] ?? 0) - (use[`${a.type}|${a.style}`] ?? 0))
    .slice(0, CHIPS);

  function close() {
    setError("");
    onClose();
  }

  async function add(g: GatePriceRow) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/projects/${projectId}/gates`, {
        method: "POST",
        body: JSON.stringify({
          name: `Gate ${gateCount + 1}`,
          description: "",
          type: g.type,
          style: g.style,
          quantity: 1,
        }),
      });
      onSaved();
      onClose();
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
        <div className="qa-title">Add gate</div>

        {chips.length === 0 && <p className="muted">Loading gate prices…</p>}
        <div className="qa-chips">
          {chips.map((g) => (
            <button
              key={`${g.type}|${g.style}`}
              type="button"
              className="qa-chip"
              disabled={busy}
              onClick={() => add(g)}
            >
              <span className="t">{g.type}</span>
              <span className="s">{g.style} · {fmtUSD(g.price)}</span>
            </button>
          ))}
        </div>

        {error && <p className="error">{error}</p>}

        <div style={{ marginTop: 12, textAlign: "center" }}>
          <Link className="qa-more" href={`/projects/${projectId}/gates/new`}>
            More options →
          </Link>
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
