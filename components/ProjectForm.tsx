"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

export interface ProjectFormValues {
  client: string;
  address: string;
  date: string;
  permit: boolean;
  labor_cost_ft: string;
  profit_margin: string;
  discount: string;
  notes: string;
  price_mod_notes: string;
}

const today = () => new Date().toISOString().slice(0, 10);

export const emptyProject: ProjectFormValues = {
  client: "",
  address: "",
  date: today(),
  permit: false,
  labor_cost_ft: "10",
  profit_margin: "0.30",
  discount: "0",
  notes: "",
  price_mod_notes: "",
};

/** Screen 3 — project form (create + edit). */
export default function ProjectForm({
  initial,
  projectId,
}: {
  initial: ProjectFormValues;
  projectId?: string;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k: keyof ProjectFormValues, val: string | boolean) =>
    setV((p) => ({ ...p, [k]: val }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const margin = Number(v.profit_margin);
    if (!(margin >= 0 && margin < 1)) {
      setError("Profit margin must be a decimal from 0 to 0.99 (e.g. 0.30 = 30%)");
      setBusy(false);
      return;
    }
    try {
      const body = {
        client: v.client,
        address: v.address,
        date: v.date,
        permit: v.permit,
        labor_cost_ft: Number(v.labor_cost_ft),
        profit_margin: margin,
        discount: Number(v.discount || 0),
        notes: v.notes,
        price_mod_notes: v.price_mod_notes,
      };
      if (projectId) {
        await api(`/api/projects/${projectId}`, { method: "PATCH", body: JSON.stringify(body) });
        router.push(`/projects/${projectId}`);
      } else {
        const created = await api<{ id: string }>("/api/projects", {
          method: "POST",
          body: JSON.stringify(body),
        });
        router.push(`/projects/${created.id}`);
      }
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h1>{projectId ? "Edit Project" : "New Project"}</h1>

      <label>Client *</label>
      <input type="text" value={v.client} onChange={(e) => set("client", e.target.value)} required />

      <label>Address</label>
      <input
        type="text"
        value={v.address}
        onChange={(e) => set("address", e.target.value)}
        placeholder="Street, City"
      />

      <label>Date</label>
      <input type="date" value={v.date} onChange={(e) => set("date", e.target.value)} />

      <div className="check">
        <input
          id="permit"
          type="checkbox"
          checked={v.permit}
          onChange={(e) => set("permit", e.target.checked)}
        />
        <label htmlFor="permit" style={{ margin: 0 }}>Permit</label>
      </div>

      <div className="row">
        <div>
          <label>Labor Cost / Ft ($)</label>
          <input
            type="number"
            step="any"
            value={v.labor_cost_ft}
            onChange={(e) => set("labor_cost_ft", e.target.value)}
          />
        </div>
        <div>
          <label>Profit Margin (0.30 = 30%)</label>
          <input
            type="number"
            step="any"
            min="0"
            max="0.99"
            value={v.profit_margin}
            onChange={(e) => set("profit_margin", e.target.value)}
          />
        </div>
      </div>

      <label>Discount ($, negative = discount)</label>
      <input
        type="number"
        step="any"
        value={v.discount}
        onChange={(e) => set("discount", e.target.value)}
      />

      <label>Notes</label>
      <textarea value={v.notes} onChange={(e) => set("notes", e.target.value)} />

      <label>Price Mod Notes</label>
      <textarea value={v.price_mod_notes} onChange={(e) => set("price_mod_notes", e.target.value)} />

      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="button" onClick={() => router.back()}>Cancel</button>
        <button className="primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </form>
  );
}
