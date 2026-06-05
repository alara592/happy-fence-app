"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/client";
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
  const [extras, setExtras] = useState<ExtraCatalogRow[] | null>(null);
  const [extraId, setExtraId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ extras: ExtraCatalogRow[] }>("/api/reference")
      .then((r) => setExtras(r.extras))
      .catch((e) => setError(e.message));
  }, []);

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
