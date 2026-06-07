"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useCached, load } from "@/lib/cache";
import { fmtUSD } from "@/lib/format";

interface ExtraCatalogRow {
  id: string;
  name: string;
  price: number;
}

/** Screen 6b — extra form: pick from the extras catalog. */
export default function NewExtraPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: ref } = useCached<{ extras: ExtraCatalogRow[] }>("/api/reference");
  const extras = ref?.extras ?? null;
  const [extraId, setExtraId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = extras?.find((x) => x.id === extraId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/api/projects/${id}/extras`, {
        method: "POST",
        body: JSON.stringify({ extra_id: extraId }),
      });
      load(`/api/projects/${id}`).catch(() => {}); // refresh cache so detail is fresh
      router.push(`/projects/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h1>Add Extra</h1>

      <label>Extra *</label>
      <select value={extraId} onChange={(e) => setExtraId(e.target.value)} required>
        <option value="" disabled>
          {extras ? "Pick an extra…" : "Loading…"}
        </option>
        {extras?.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name} — {fmtUSD(x.price)}
          </option>
        ))}
      </select>

      {selected && (
        <div className="card spread">
          <span>Price</span>
          <strong>{fmtUSD(selected.price)}</strong>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="button" onClick={() => router.back()}>Cancel</button>
        <button className="primary" disabled={busy || !selected}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </form>
  );
}
