"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/client";
import { fmtUSD } from "@/lib/format";

interface Bundle {
  project: { client: string; address: string | null; permit: boolean; discount: number };
  gates: { id: string; name: string; quantity: number }[];
  extras: { id: string; name: string }[];
  activeType: string | null;
  total: number | null;
  totalLinearFt: number;
}

/** Customer-facing "Present" screen — read-only. No margin, labor, or price board. */
export default function PresentPage() {
  const { id } = useParams<{ id: string }>();
  const [b, setB] = useState<Bundle | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Bundle>(`/api/projects/${id}`).then(setB).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!b) return <p className="muted">Loading…</p>;
  const { project: p } = b;
  const disc = p.discount;

  return (
    <div className="present">
      <div className="p-hero">
        <div className="p-logo">HAPPY FENCE COMPANY</div>
        <div className="p-sub">Your fence estimate</div>
      </div>

      <div className="p-body">
        <div className="p-client">{p.client}</div>
        {p.address && <div className="p-addr">{p.address}</div>}

        {b.activeType && b.total !== null ? (
          <>
            <div className="p-fence-card">
              <div className="p-fence-label">Your fence</div>
              <div className="p-fence-name">{b.activeType}</div>
              <div className="p-total-label">Project total</div>
              <div className="p-total">{fmtUSD(b.total)}</div>
            </div>

            <div className="p-included">
              <h4>What&apos;s included</h4>
              <div className="p-line">
                <span>Fence — {b.activeType}, {b.totalLinearFt} ft</span>
                <span className="v">included</span>
              </div>
              {p.permit && (
                <div className="p-line"><span>Permit</span><span className="v">included</span></div>
              )}
              {b.gates.map((g) => (
                <div key={g.id} className="p-line">
                  <span>Gate — {g.name}{g.quantity > 1 ? ` × ${g.quantity}` : ""}</span>
                  <span className="v">included</span>
                </div>
              ))}
              {b.extras.map((x) => (
                <div key={x.id} className="p-line"><span>{x.name}</span><span className="v">included</span></div>
              ))}
              {disc < 0 && (
                <div className="p-line disc"><span>Your discount</span><span className="v">−{fmtUSD(Math.abs(disc))}</span></div>
              )}
              {disc > 0 && (
                <div className="p-line"><span>Adjustment</span><span className="v">+{fmtUSD(disc)}</span></div>
              )}
              <div className="p-line grand">
                <span>Total</span><span className="v" style={{ color: "#1a7f37" }}>{fmtUSD(b.total)}</span>
              </div>
            </div>
          </>
        ) : (
          <p className="muted" style={{ marginTop: 20 }}>
            No fence selected yet — set an Active fence to present a price.
          </p>
        )}
      </div>

      <div className="p-foot">
        Estimate valid 30 days · <span className="biz">happyfencecompany.com</span><br />
        Thank you for considering Happy Fence Company
        <div style={{ marginTop: 14 }}>
          <Link href={`/projects/${id}`}>← Back to project</Link>
        </div>
      </div>
    </div>
  );
}
