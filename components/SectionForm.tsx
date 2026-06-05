"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import type { GlobalSettings } from "@/lib/pricing";

export interface SectionFormValues {
  name: string;
  description: string;
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
  linear_ft: "",
  tear_down: false,
  take_down_ft: "0",
  dump: false,
  tear_down_rate: "",
  dump_rate: "",
};

/** Screen 5 — section form: pure measurement (material lives on the price board). */
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
  const [settings, setSettings] = useState<GlobalSettings | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ settings: GlobalSettings }>("/api/reference")
      .then((r) => setSettings(r.settings))
      .catch((e) => setError(e.message));
  }, []);

  const set = (k: keyof SectionFormValues, val: string | boolean) =>
    setV((p) => ({ ...p, [k]: val }));

  /** Take-down ft mirrors linear ft by default (Anthony: "it always will"), but stays editable. */
  const setLinearFt = (val: string) =>
    setV((p) => ({
      ...p,
      linear_ft: val,
      take_down_ft:
        p.take_down_ft === p.linear_ft || p.take_down_ft === "0" || p.take_down_ft === ""
          ? val
          : p.take_down_ft,
    }));

  const toggle = (k: "tear_down" | "dump", checked: boolean) =>
    setV((p) => ({
      ...p,
      [k]: checked,
      take_down_ft:
        checked && (p.take_down_ft === "0" || p.take_down_ft === "") ? p.linear_ft : p.take_down_ft,
    }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = {
        name: v.name,
        description: v.description,
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

  const takeDownField = (
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
  );

  return (
    <form onSubmit={submit}>
      <h1>{sectionId ? "Edit Section" : "New Section"}</h1>

      <label>Name *</label>
      <input type="text" value={v.name} onChange={(e) => set("name", e.target.value)} required />

      <label>Description</label>
      <input type="text" value={v.description} onChange={(e) => set("description", e.target.value)} />

      <label>Linear Ft *</label>
      <input
        type="number"
        step="any"
        min="0"
        value={v.linear_ft}
        onChange={(e) => setLinearFt(e.target.value)}
        required
      />

      <div className="check">
        <input
          id="teardown"
          type="checkbox"
          checked={v.tear_down}
          onChange={(e) => toggle("tear_down", e.target.checked)}
        />
        <label htmlFor="teardown" style={{ margin: 0 }}>Tear Down</label>
      </div>
      {v.tear_down && (
        <>
          <label>Tear Down Rate ($/ft — blank = default {settings?.defaultTearDownRate ?? "…"})</label>
          <input
            type="number"
            step="any"
            value={v.tear_down_rate}
            placeholder={String(settings?.defaultTearDownRate ?? "")}
            onChange={(e) => set("tear_down_rate", e.target.value)}
          />
          {takeDownField}
        </>
      )}

      <div className="check">
        <input
          id="dump"
          type="checkbox"
          checked={v.dump}
          onChange={(e) => toggle("dump", e.target.checked)}
        />
        <label htmlFor="dump" style={{ margin: 0 }}>Dump</label>
      </div>
      {v.dump && (
        <>
          <label>Dump Rate ($/ft — blank = default {settings?.defaultDumpRate ?? "…"})</label>
          <input
            type="number"
            step="any"
            value={v.dump_rate}
            placeholder={String(settings?.defaultDumpRate ?? "")}
            onChange={(e) => set("dump_rate", e.target.value)}
          />
          {!v.tear_down && takeDownField}
        </>
      )}

      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="button" onClick={() => router.back()}>Cancel</button>
        <button className="primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </form>
  );
}
