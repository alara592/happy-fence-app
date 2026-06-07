"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCached } from "@/lib/cache";
import { fmtUSD, fmtDate } from "@/lib/format";

/** Company contact shown on the customer estimate. Phone left blank until provided —
 *  we don't show a fake number. Fill `phone` to surface it. */
const COMPANY = { name: "Happy Fence Company", phone: "", web: "happyfencecompany.com" };

interface Bundle {
  project: { client: string; address: string | null; date: string; permit: boolean; discount: number };
  gates: { id: string; name: string; style: string; actual_price: number; quantity: number }[];
  extras: { id: string; name: string; price: number }[];
  activeType: string | null;
  total: number | null;
  totalLinearFt: number;
  fenceSubtotal: number | null;
  permitFee: number;
}

/** Customer-facing "Present" screen — itemized proposal, grouped by category.
 *  Read-only and customer-safe: margin, labor, and the price board never render here. */
export default function PresentPage() {
  const { id } = useParams<{ id: string }>();
  const { data: b, error } = useCached<Bundle>(`/api/projects/${id}`);

  if (error && !b) return <p className="error">{error.message}</p>;
  if (!b) return <p className="muted">Loading…</p>;

  const { project: p } = b;
  const priced = b.activeType && b.total !== null;

  return (
    <div className="present">
      <div className="pv-head">
        <div className="pv-logo">{COMPANY.name.toUpperCase()}</div>
        <div className="pv-contact">
          {COMPANY.phone && <>{COMPANY.phone}<br /></>}
          {COMPANY.web}
        </div>
      </div>

      <div className="pv-sub">
        <div className="pv-est">Estimate · {fmtDate(p.date)}</div>
        <div className="pv-client">{p.client}</div>
        {p.address && <div className="pv-meta">{p.address}</div>}
      </div>

      {priced ? (
        <>
          <div className="pv-body">
            <div className="pv-grp">Fence &amp; installation</div>
            <div className="pv-row">
              <span>{b.activeType}<small>{b.totalLinearFt} linear ft</small></span>
              <span className="v">{b.fenceSubtotal !== null ? fmtUSD(b.fenceSubtotal) : "—"}</span>
            </div>

            {b.gates.length > 0 && (
              <>
                <div className="pv-grp">Gates</div>
                {b.gates.map((g) => (
                  <div key={g.id} className="pv-row">
                    <span>
                      {g.name}
                      <small>{g.style}{g.quantity > 1 ? ` · ×${g.quantity}` : ""}</small>
                    </span>
                    <span className="v">{fmtUSD(g.actual_price * g.quantity)}</span>
                  </div>
                ))}
              </>
            )}

            {b.extras.length > 0 && (
              <>
                <div className="pv-grp">Add-ons</div>
                {b.extras.map((x) => (
                  <div key={x.id} className="pv-row"><span>{x.name}</span><span className="v">{fmtUSD(x.price)}</span></div>
                ))}
              </>
            )}

            {p.permit && (
              <>
                <div className="pv-grp">Permits &amp; fees</div>
                <div className="pv-row"><span>County permit</span><span className="v">{fmtUSD(b.permitFee)}</span></div>
              </>
            )}

            {p.discount < 0 && (
              <div className="pv-row disc" style={{ marginTop: 10 }}>
                <span>Your discount</span><span className="v">−{fmtUSD(Math.abs(p.discount))}</span>
              </div>
            )}
            {p.discount > 0 && (
              <div className="pv-row" style={{ marginTop: 10 }}>
                <span>Adjustment</span><span className="v">+{fmtUSD(p.discount)}</span>
              </div>
            )}
          </div>

          <div className="pv-total">
            <span className="l">Total estimate</span>
            <span className="n">{fmtUSD(b.total!)}</span>
          </div>
        </>
      ) : (
        <div className="pv-body">
          <p className="muted" style={{ marginTop: 16 }}>
            No fence selected yet — set an Active fence to present a price.
          </p>
        </div>
      )}

      <div className="pv-foot">
        Estimate valid 30 days · <span className="biz">{COMPANY.web}</span><br />
        Thank you for considering {COMPANY.name}
        <div style={{ marginTop: 14 }}>
          <Link href={`/projects/${id}`}>← Back to project</Link>
        </div>
      </div>
    </div>
  );
}
