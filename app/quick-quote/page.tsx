"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useCached, load, prefetch } from "@/lib/cache";
import { fmtUSD, etDate } from "@/lib/format";
import { matchGateType, quickTotal, quoteRange } from "@/lib/quickquote";
import type { FencePriceRow, GatePriceRow, GlobalSettings } from "@/lib/pricing";

interface Reference {
  fencePrices: FencePriceRow[];
  gatePrices: GatePriceRow[];
  settings: GlobalSettings;
}

/** Scratch state survives a mid-call refresh; cleared on promote/Clear. */
const SCRATCH_KEY = "hfc-qq-v1";

interface Scratch {
  ft: string;
  walk: number;
  dbl: number;
  tear: boolean;
  permit: boolean;
  sel: string | null;
}

const BLANK: Scratch = { ft: "", walk: 0, dbl: 0, tear: false, permit: true, sel: null };

/**
 * Quick Quote — the assistant's qualification calculator (desktop concept Screen A,
 * approved 2026-06-12). Nothing here writes to the DB until "Save as project".
 * Labor/margin ride on the same defaults the project POST uses (lib/quickquote.ts).
 */
export default function QuickQuotePage() {
  const router = useRouter();
  const { data: ref, error } = useCached<Reference>("/api/reference");
  const [s, setS] = useState<Scratch>(BLANK);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [client, setClient] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const ftRef = useRef<HTMLInputElement>(null);

  // Hydrate the scratch pad from localStorage after mount (SSR renders the blank pad).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SCRATCH_KEY);
      if (raw) setS({ ...BLANK, ...(JSON.parse(raw) as Partial<Scratch>) });
    } catch {
      /* corrupt/blocked storage — start blank */
    }
    ftRef.current?.focus();
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(SCRATCH_KEY, JSON.stringify(s));
    } catch {
      /* quota/private mode — scratch just won't survive a refresh */
    }
  }, [s]);

  const ft = Math.max(0, Number(s.ft) || 0);
  const inputs = { linearFt: ft, walkGates: s.walk, doubleGates: s.dbl, tearDown: s.tear, permit: s.permit };

  // Whole catalog priced under the current inputs, cheapest first, unpriced last.
  const rows = useMemo(() => {
    if (!ref || ft <= 0) return null;
    return ref.fencePrices
      .map((f) => ({ f, total: quickTotal(f.type, inputs, ref.fencePrices, ref.gatePrices, ref.settings) }))
      .sort((a, b) => Number(a.total === null) - Number(b.total === null) || (a.total ?? 0) - (b.total ?? 0));
  }, [ref, ft, s.walk, s.dbl, s.tear, s.permit]);

  // Selection: sticky once made; otherwise follow the cheapest priced row.
  const sel = s.sel && rows?.some((r) => r.f.type === s.sel) ? s.sel : (rows?.find((r) => r.total !== null)?.f.type ?? null);
  const selTotal = sel && rows ? (rows.find((r) => r.f.type === sel)?.total ?? null) : null;
  const range = selTotal !== null ? quoteRange(selTotal) : null;

  function clearAll() {
    setS(BLANK);
    setSaveError("");
    ftRef.current?.focus();
  }

  // Esc: close the promote modal if open, otherwise clear the pad for the next call.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (promoteOpen) setPromoteOpen(false);
      else clearAll();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [promoteOpen]);

  /** Promote: real project + "Phone estimate" measurement + material (auto-actives) + gates. */
  async function promote() {
    if (!ref || !sel || ft <= 0 || busy) return;
    if (!client.trim()) {
      setSaveError("Client name is required");
      return;
    }
    setBusy(true);
    setSaveError("");
    try {
      const p = await api<{ id: string }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          client: client.trim(),
          address: address.trim() || null,
          date: etDate(new Date()),
          permit: s.permit,
        }),
      });
      await api(`/api/projects/${p.id}/sections`, {
        method: "POST",
        body: JSON.stringify({
          name: "Phone estimate",
          linear_ft: ft,
          tear_down: s.tear,
          dump: s.tear,
          take_down_ft: s.tear ? ft : 0,
        }),
      });
      await api(`/api/projects/${p.id}/materials`, {
        method: "POST",
        body: JSON.stringify({ type: sel }),
      });
      const gateType = matchGateType(sel, ref.gatePrices);
      if (gateType) {
        for (const [style, qty] of [["Single", s.walk], ["Double", s.dbl]] as const) {
          if (qty > 0) {
            await api(`/api/projects/${p.id}/gates`, {
              method: "POST",
              body: JSON.stringify({ name: gateType, type: gateType, style, quantity: qty }),
            });
          }
        }
      }
      load("/api/projects").catch(() => {});
      prefetch(`/api/projects/${p.id}`);
      try {
        window.localStorage.removeItem(SCRATCH_KEY);
      } catch {
        /* ignore */
      }
      router.push(`/projects/${p.id}`);
    } catch (e) {
      setSaveError((e as Error).message);
      setBusy(false);
    }
  }

  const summary = [
    selTotal !== null ? `exact ${fmtUSD(selTotal)}` : "",
    ft > 0 ? `${ft} ft` : "",
    s.walk > 0 ? `${s.walk} walk gate${s.walk > 1 ? "s" : ""}` : "",
    s.dbl > 0 ? `${s.dbl} double` : "",
    s.tear ? "tear-down" : "",
    ref ? (s.permit ? `permit ${fmtUSD(ref.settings.permitFee)}` : "no permit") : "",
  ].filter(Boolean).join(" · ");

  return (
    <>
      <h1>Quick Quote</h1>
      <p className="muted" style={{ margin: "0 0 12px" }}>
        Ballpark for a phone call — nothing is saved until you promote it.
      </p>
      {error && !ref && <p className="error">{error.message}</p>}

      <div className="qq">
        <div className="qq-pad">
          <p className="qq-label">How many feet of fence?</p>
          <div className="qq-ftrow">
            <input
              ref={ftRef}
              type="number"
              inputMode="numeric"
              placeholder="0"
              value={s.ft}
              onChange={(e) => setS({ ...s, ft: e.target.value })}
            />
            <span className="unit">linear ft</span>
          </div>

          <p className="qq-label" style={{ marginTop: 18 }}>Gates</p>
          <div className="qq-gline">
            <span className="nm">Walk gate<small>matched to the fence material</small></span>
            <span className="qq-step">
              <button type="button" onClick={() => setS((p) => ({ ...p, walk: Math.max(0, p.walk - 1) }))}>−</button>
              <span className="qty">{s.walk}</span>
              <button type="button" onClick={() => setS((p) => ({ ...p, walk: p.walk + 1 }))}>+</button>
            </span>
          </div>
          <div className="qq-gline">
            <span className="nm">Double / driveway gate</span>
            <span className="qq-step">
              <button type="button" onClick={() => setS((p) => ({ ...p, dbl: Math.max(0, p.dbl - 1) }))}>−</button>
              <span className="qty">{s.dbl}</span>
              <button type="button" onClick={() => setS((p) => ({ ...p, dbl: p.dbl + 1 }))}>+</button>
            </span>
          </div>

          <div className="qq-tog" onClick={() => setS((p) => ({ ...p, tear: !p.tear }))}>
            <span className="nm">
              Tear down &amp; haul old fence
              <small>assumes the whole run</small>
            </span>
            <span className={`qq-sw${s.tear ? " on" : ""}`} />
          </div>
          <div className="qq-tog" onClick={() => setS((p) => ({ ...p, permit: !p.permit }))}>
            <span className="nm">
              Permit
              <small>{ref ? `${fmtUSD(ref.settings.permitFee)} flat` : ""}</small>
            </span>
            <span className={`qq-sw${s.permit ? " on" : ""}`} />
          </div>

          <div className="qq-total">
            <div className="mat">{sel ?? "—"}</div>
            <div className="amt">{range ? `${fmtUSD(range.lo)} – ${fmtUSD(range.hi)}` : "$0"}</div>
            <div className="sub">{summary}</div>
          </div>
          <div className="qq-exits">
            <button
              type="button"
              className="primary qq-save"
              disabled={!sel || ft <= 0 || selTotal === null}
              onClick={() => {
                setSaveError("");
                setPromoteOpen(true);
              }}
            >
              Save as project →
            </button>
            <button type="button" onClick={clearAll}>Clear</button>
          </div>
          {saveError && !promoteOpen && <p className="error">{saveError}</p>}
        </div>

        <div className="qq-list">
          <div className="qq-list-head">
            <h2>This job under every material</h2>
            <span className="muted">cheapest first · click to quote it</span>
          </div>
          {!rows && <div className="qq-empty">Type a footage to price the whole catalog</div>}
          {rows?.map(({ f, total }) =>
            total === null ? (
              <div key={f.type} className="qq-row unp">
                <span className="nm">
                  {f.type}
                  <small>unpriced — needs a $/section before it can be quoted</small>
                </span>
                <span className="tt">⚠ no price</span>
              </div>
            ) : (
              <button
                key={f.type}
                type="button"
                className={`qq-row${f.type === sel ? " sel" : ""}`}
                onClick={() => setS({ ...s, sel: f.type })}
              >
                <span className="nm">
                  {f.type === sel ? "★ " : ""}
                  {f.type}
                  <small>{fmtUSD(f.perSection)}/section · {f.ftPerSection} ft</small>
                </span>
                <span className="tt">{fmtUSD(total)}</span>
              </button>
            ),
          )}
        </div>
      </div>

      {promoteOpen && (
        <div className="modal-backdrop" onClick={() => !busy && setPromoteOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="body" style={{ textAlign: "left" }}>
              <strong>Save as project</strong>
              <p style={{ color: "var(--brand)", fontWeight: 700 }}>
                {range ? `${fmtUSD(range.lo)} – ${fmtUSD(range.hi)}` : ""} · {sel}
              </p>
              <label htmlFor="qq-client">Client</label>
              <input
                id="qq-client"
                type="text"
                value={client}
                onChange={(e) => setClient(e.target.value)}
                autoFocus
              />
              <label htmlFor="qq-address">Address (optional)</label>
              <input
                id="qq-address"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
              {saveError && <p className="error">{saveError}</p>}
            </div>
            <div className="btns">
              <button disabled={busy} onClick={() => setPromoteOpen(false)}>Cancel</button>
              <button
                style={{ color: "var(--brand)", fontWeight: 700 }}
                disabled={busy}
                onClick={promote}
              >
                {busy ? "Creating…" : "Create project"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
