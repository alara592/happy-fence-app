"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import type { FencePriceRow, GlobalSettings } from "@/lib/pricing";

export interface SectionFormValues {
  name: string;
  description: string;
  type: string;
  linear_ft: string;
  tear_down: boolean;
  take_down_ft: string;
  dump: boolean;
  tear_down_rate: string; // "" = use global default
  dump_rate: string; // "" = use global default
}

export const emptySection: SectionFormValues = {
  name: "",
  description: "",
  type: "",
  linear_ft: "",
  tear_down: false,
  take_down_ft: "0",
  dump: false,
  tear_down_rate: "",
  dump_rate: "",
};

interface Reference {
  fencePrices: FencePriceRow[];
  settings: GlobalSettings;
}

/** Screen 5 — section form. Price computed server-side via lib/pricing.ts on save. */
export default function SectionForm({
  projectId,
  sectionId,
  initial,
}: {
  projectId: string;
  sectionId?: string;
  initial: SectionFormValues;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [ref, setRef] = useState<Reference | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Reference>("/api/reference").then(setRef).catch((e) => setError(e.message));
  }, []);

  const set = (k: keyof SectionFormValues, val: string | boolean) =>
    setV((p) => ({ ...p, [k]: val }));

  const selected = ref?.fencePrices.find((f) => f.type === v.type);
  const unpriced = selected != null && selected.perSection === 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = {
        name: v.name,
        description: v.description,
        type: v.type,
        linear_ft: Number(v.linear_ft),
        tear_down: v.tear_down,
        take_down_ft: Number(v.take_down_ft || 0),
        dump: v.dump,
        tear_down_rate: v.tear_down_rate === "" ? null : Number(v.tear_down_rate),
        dump_rate: v.dump_rate === "" ? null : Number(v.dump_rate),
      };
      if (sectionId) {
        await api(`/api/projects/${projectId}/sections/${sectionId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        await api(`/api/projects/${projectId}/sections`, {
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
      <h1>{sectionId ? "Edit Section" : "New Section"}</h1>

      <label>Name *</label>
      <input type="text" value={v.name} onChange={(e) => set("name", e.target.value)} required />

      <label>Description</label>
      <input type="text" value={v.description} onChange={(e) => set("description", e.target.value)} />

      <label>Type *</label>
      <select value={v.type} onChange={(e) => set("type", e.target.value)} required>
        <option value="" disabled>
          {ref ? "Pick a fence type…" : "Loading types…"}
        </option>
        {ref?.fencePrices.map((f) => (
          <option key={f.type} value={f.type}>
            {f.type}
            {f.perSection === 0 ? " (UNPRICED)" : ""}
          </option>
        ))}
      </select>
      {unpriced && (
        <div className="warn">
          ⚠ <strong>{v.type}</strong> has no material price ($0/section). The quote will only
          include hardware + labor — confirm the price table before using this.
        </div>
      )}

      <label>Linear Ft *</label>
      <input
        type="number"
        step="any"
        min="0"
        value={v.linear_ft}
        onChange={(e) => set("linear_ft", e.target.value)}
        required
      />

      <div className="check">
        <input
          id="teardown"
          type="checkbox"
          checked={v.tear_down}
          onChange={(e) => set("tear_down", e.target.checked)}
        />
        <label htmlFor="teardown" style={{ margin: 0 }}>Tear Down</label>
      </div>
      {v.tear_down && (
        <>
          <label>Tear Down Rate ($/ft — blank = default {ref?.settings.defaultTearDownRate ?? "…"})</label>
          <input
            type="number"
            step="any"
            value={v.tear_down_rate}
            placeholder={String(ref?.settings.defaultTearDownRate ?? "")}
            onChange={(e) => set("tear_down_rate", e.target.value)}
          />
        </>
      )}

      <div className="check">
        <input
          id="dump"
          type="checkbox"
          checked={v.dump}
          onChange={(e) => set("dump", e.target.checked)}
        />
        <label htmlFor="dump" style={{ margin: 0 }}>Dump</label>
      </div>
      {v.dump && (
        <>
          <label>Dump Rate ($/ft — blank = default {ref?.settings.defaultDumpRate ?? "…"})</label>
          <input
            type="number"
            step="any"
            value={v.dump_rate}
            placeholder={String(ref?.settings.defaultDumpRate ?? "")}
            onChange={(e) => set("dump_rate", e.target.value)}
          />
        </>
      )}

      {(v.tear_down || v.dump) && (
        <>
          <label>Take Down Ft</label>
          <input
            type="number"
            step="any"
            min="0"
            value={v.take_down_ft}
            onChange={(e) => set("take_down_ft", e.target.value)}
          />
        </>
      )}

      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="button" onClick={() => router.back()}>Cancel</button>
        <button className="primary" disabled={busy || !ref}>
          {busy ? "Saving…" : "Save (computes price)"}
        </button>
      </div>
    </form>
  );
}
