"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { fmtUSD } from "@/lib/format";
import type { GatePriceRow } from "@/lib/pricing";

export interface GateFormValues {
  name: string;
  description: string;
  type: string;
  style: "Single" | "Double" | "";
}

export const emptyGate: GateFormValues = { name: "", description: "", type: "", style: "" };

/** Screen 6a — gate form: type + Single/Double → flat price lookup. */
export default function GateForm({
  projectId,
  gateId,
  initial,
}: {
  projectId: string;
  gateId?: string;
  initial: GateFormValues;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [gatePrices, setGatePrices] = useState<GatePriceRow[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ gatePrices: GatePriceRow[] }>("/api/reference")
      .then((r) => setGatePrices(r.gatePrices))
      .catch((e) => setError(e.message));
  }, []);

  const types = useMemo(
    () => Array.from(new Set((gatePrices ?? []).map((g) => g.type))),
    [gatePrices],
  );
  const stylesForType = (gatePrices ?? [])
    .filter((g) => g.type === v.type)
    .map((g) => g.style);
  const preview = (gatePrices ?? []).find((g) => g.type === v.type && g.style === v.style);

  const set = (k: keyof GateFormValues, val: string) => setV((p) => ({ ...p, [k]: val }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = { name: v.name, description: v.description, type: v.type, style: v.style };
      if (gateId) {
        await api(`/api/projects/${projectId}/gates/${gateId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        await api(`/api/projects/${projectId}/gates`, {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      router.push(`/projects/${projectId}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h1>{gateId ? "Edit Gate" : "New Gate"}</h1>

      <label>Name *</label>
      <input type="text" value={v.name} onChange={(e) => set("name", e.target.value)} required />

      <label>Description</label>
      <input type="text" value={v.description} onChange={(e) => set("description", e.target.value)} />

      <label>Type *</label>
      <select value={v.type} onChange={(e) => set("type", e.target.value)} required>
        <option value="" disabled>
          {gatePrices ? "Pick a gate type…" : "Loading types…"}
        </option>
        {types.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>

      <label>Single / Double *</label>
      <select value={v.style} onChange={(e) => set("style", e.target.value)} required disabled={!v.type}>
        <option value="" disabled>Pick…</option>
        {stylesForType.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      {preview && (
        <div className="card spread">
          <span>Price</span>
          <strong>{fmtUSD(preview.price)}</strong>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="button" onClick={() => router.back()}>Cancel</button>
        <button className="primary" disabled={busy || !preview}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </form>
  );
}
