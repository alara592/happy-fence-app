/**
 * Pricing engine fixture suite.
 * Ground truth: RECOVERY-stuck-sync-rows-2026-06-03.md (new-formula, hand-verified)
 * + formula semantics from CHANGELOG Entries #1 and #5.
 * NOTE: How-It-Works §6's eight reconciled jobs are OLD-formula prices — deliberately NOT used.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ceil100,
  wholeSections,
  sectionPrice,
  gatePrice,
  projectTotal,
  type GlobalSettings,
  type FencePriceRow,
  type GatePriceRow,
} from "../lib/pricing.ts";

const SETTINGS: GlobalSettings = { defaultTearDownRate: 3, defaultDumpRate: 3, permitFee: 300 };

// Live values pulled from the backing Sheets 2026-06-04
const FENCE_PRICES: FencePriceRow[] = [
  { type: "Privacy Vinyl - White", perSection: 91, ftPerSection: 6 },
  { type: "Horizontal DuraFence", perSection: 70, ftPerSection: 4 },
  { type: "Wood - Dog Ear", perSection: 60, ftPerSection: 4 },
  { type: "DuraFence", perSection: 65, ftPerSection: 4 },
];
const GATE_PRICES: GatePriceRow[] = [
  { type: "Vinyl", style: "Single", price: 695 },
  { type: "Vinyl", style: "Double", price: 1429 },
  { type: "Durafence", style: "Single", price: 534 },
];

// ── Ground-truth fixtures ──────────────────────────────────────────────

test("FIXTURE Frank Theye — 80ft Privacy Vinyl - White, labor 12, 30%, tear-down 80 → $3,600", () => {
  const r = sectionPrice(
    { linearFt: 80, type: "Privacy Vinyl - White", tearDown: true, dump: false, takeDownFt: 80 },
    FENCE_PRICES[0],
    { laborCostFt: 12, profitMargin: 0.3 },
    SETTINGS,
  );
  // 14 sections × $91 + $40 hw + $960 labor + $240 tear = 2514 ÷ 0.7 = 3591.43 → 3600
  assert.equal(r.sections, 14);
  assert.equal(r.subtotalCost, 2514);
  assert.equal(r.price, 3600);
});

test("FIXTURE Pedro Bravo — 67ft Horizontal DuraFence, labor 10, 35%, tear-down 67 → $3,300", () => {
  const r = sectionPrice(
    { linearFt: 67, type: "Horizontal DuraFence", tearDown: true, dump: false, takeDownFt: 67 },
    FENCE_PRICES[1],
    { laborCostFt: 10, profitMargin: 0.35 },
    SETTINGS,
  );
  // 17 sections × $70 + $33.50 hw + $670 labor + $201 tear = 2094.50 ÷ 0.65 = 3222.31 → 3300
  assert.equal(r.sections, 17);
  assert.equal(r.subtotalCost, 2094.5);
  assert.equal(r.price, 3300);
});

// ── Formula semantics (CHANGELOG #1) ──────────────────────────────────

test("section count CEILINGs — 230ft at 8ft/section charges 29 sections, not 28.75", () => {
  assert.equal(wholeSections(230, 8), 29);
});

test("exact-fit footage does not over-ceil — 24ft at 6ft/section = exactly 4 sections", () => {
  assert.equal(wholeSections(24, 6), 4);
});

test("CEIL_100 rounds up, exact $100 multiples stay put, float artifacts guarded", () => {
  assert.equal(ceil100(3591.43), 3600);
  assert.equal(ceil100(3500), 3500);
  assert.equal(ceil100(3500.0000000004), 3500); // float noise must not bump a clean multiple
  assert.equal(ceil100(3500.01), 3600);
});

test("hardware is $0.50/ft inside the markup", () => {
  const r = sectionPrice(
    { linearFt: 100, type: "Wood - Dog Ear", tearDown: false, dump: false, takeDownFt: 0 },
    FENCE_PRICES[2],
    { laborCostFt: 10, profitMargin: 0.3 },
    SETTINGS,
  );
  assert.equal(r.hardware, 50); // 100 ft × $0.50
  // 25×60 + 50 + 1000 = 2550 ÷ 0.7 = 3642.86 → 3700
  assert.equal(r.price, 3700);
});

test("dump and tear-down are independent toggles at the same default rate", () => {
  const base = { linearFt: 100, type: "Wood - Dog Ear", takeDownFt: 100 };
  const proj = { laborCostFt: 10, profitMargin: 0.3 };
  const both = sectionPrice({ ...base, tearDown: true, dump: true }, FENCE_PRICES[2], proj, SETTINGS);
  const tearOnly = sectionPrice({ ...base, tearDown: true, dump: false }, FENCE_PRICES[2], proj, SETTINGS);
  assert.equal(both.tearDownCost, 300);
  assert.equal(both.dumpCost, 300);
  assert.equal(tearOnly.dumpCost, 0);
});

// ── Override-or-global rates (CHANGELOG #5) ───────────────────────────

test("override rate flows into price; blank uses global; explicit 0 = no charge", () => {
  const base = { linearFt: 100, type: "Wood - Dog Ear", tearDown: true, dump: false, takeDownFt: 100 };
  const proj = { laborCostFt: 10, profitMargin: 0.3 };
  const global3 = sectionPrice({ ...base }, FENCE_PRICES[2], proj, SETTINGS);
  const override10 = sectionPrice({ ...base, tearDownRate: 10 }, FENCE_PRICES[2], proj, SETTINGS);
  const explicit0 = sectionPrice({ ...base, tearDownRate: 0 }, FENCE_PRICES[2], proj, SETTINGS);
  assert.equal(global3.tearDownCost, 300);
  assert.equal(override10.tearDownCost, 1000);
  assert.equal(explicit0.tearDownCost, 0);
  assert.ok(override10.price > global3.price);
});

// ── Gates + project total (How-It-Works §5) ───────────────────────────

test("gate price is a flat lookup on type + style", () => {
  assert.equal(gatePrice("Vinyl", "Single", GATE_PRICES), 695);
  assert.equal(gatePrice("Vinyl", "Double", GATE_PRICES), 1429);
  assert.equal(gatePrice("Nonexistent", "Single", GATE_PRICES), null);
});

test("project total = sections + permit(300) + gates + discount + extras; unmatched gates surfaced", () => {
  const r = projectTotal(
    {
      laborCostFt: 12,
      profitMargin: 0.3,
      permit: true,
      discount: -200,
      sections: [{ linearFt: 80, type: "Privacy Vinyl - White", tearDown: true, dump: false, takeDownFt: 80 }],
      gates: [
        { type: "Vinyl", style: "Single" },
        { type: "Mystery Gate", style: "Single" },
      ],
      extras: [{ price: 300 }],
    },
    FENCE_PRICES,
    GATE_PRICES,
    SETTINGS,
  );
  assert.equal(r.sectionsTotal, 3600); // Frank's section
  assert.equal(r.permitFee, 300);
  assert.equal(r.gatesTotal, 695);
  assert.equal(r.extrasTotal, 300);
  assert.equal(r.total, 3600 + 300 + 695 - 200 + 300); // 4695
  assert.deepEqual(r.unmatchedGateTypes, ["Mystery Gate/Single"]);
});

test("estCost = section COGS + permit + extras; excludes gates and discount", () => {
  const r = projectTotal(
    {
      laborCostFt: 12,
      profitMargin: 0.3,
      permit: true,
      discount: -200,
      sections: [{ linearFt: 80, type: "Privacy Vinyl - White", tearDown: true, dump: false, takeDownFt: 80 }],
      gates: [{ type: "Vinyl", style: "Single" }], // priced at 695, but contributes $0 to cost
      extras: [{ price: 300 }],
    },
    FENCE_PRICES,
    GATE_PRICES,
    SETTINGS,
  );
  // Frank's section pre-markup COGS: 14×91 + 40 hardware + 960 labor + 240 tear-down = 2514
  assert.equal(r.sectionsCost, 2514);
  assert.equal(r.estCost, 2514 + 300 + 300); // + permit + extras; gate 695 and discount −200 excluded
});

test("permit off adds nothing; positive discount = surcharge", () => {
  const r = projectTotal(
    {
      laborCostFt: 12,
      profitMargin: 0.3,
      permit: false,
      discount: 150,
      sections: [{ linearFt: 80, type: "Privacy Vinyl - White", tearDown: true, dump: false, takeDownFt: 80 }],
      gates: [],
      extras: [],
    },
    FENCE_PRICES,
    GATE_PRICES,
    SETTINGS,
  );
  assert.equal(r.total, 3750);
});
