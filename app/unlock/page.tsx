"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Screen 1 — shared PIN, remembered per device (httpOnly cookie). */
export default function UnlockPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    if (res.ok) {
      router.replace("/");
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Wrong PIN");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h1>Happy Fence Company</h1>
      <label htmlFor="pin">Enter PIN</label>
      <input
        id="pin"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        autoFocus
      />
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button className="primary" disabled={busy || !pin}>
          {busy ? "Checking…" : "Unlock"}
        </button>
      </div>
    </form>
  );
}
