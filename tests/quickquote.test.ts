/**
 * Quick Quote helpers — gate auto-match, the −5%/+10% range, and engine consistency
 * (a quick total must equal the same job priced through projectTotal directly).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  matchGateType,
  quoteRange,
  quickTotal,
  QQ_LABOR_COST_FT,
  QQ_PROFIT_MARGIN,
} from "../lib/quickquote.ts";
import {
  projectTotal,
  type FencePriceRow,
  type GatePriceRow,
  type GlobalSettings,
} from "../lib/pricing.ts";

const SETTINGS: GlobalSettings = { defaultTearDownRate: 3, defaultDumpRate: 3, permitFee: 800 };

const FENCE_PRICES: FencePriceRow[] = [
  { type: "Vinyl - Privacy - White", perSection: 91, ftPerSection: 6 },
  { type: "Vinyl - Privacy - Cypress", perSection: 121, ftPerSection: 6 },
  { type: "Wood - Dog Ear", perSection: 60, ftPerSection: 4 },
  { type: "Aluminum - 6x6", perSection: 180, ftPerSection: 6 },
  { type: "Chainlink", perSection: 0, ftPerSection: 10 }, // unpriced flag
];

// Live gate catalog shape (seed/price-tables-2026-06-04.json)
const GATE_PRICES: GatePriceRow[] = [
  { type: "Vinyl", style: "Single", price: 695 },
  { type: "Vinyl", style: "Double", price: 1429 },
  { type: "Wood", style: "Single", price: 504 },
  { type: "Wood", style: "Double", price: 926 },
  { type: "Aluminum(6ft)", style: "Single", price: 1058 },
  { type: "Privacy Vinyl - Cypress", style: "Single", price: 765 },
];

// ── matchGateType ──────────────────────────────────────────────────────

test("gate match: wood fence → Wood gate", () => {
  assert.equal(matchGateType("Wood - Dog Ear", GATE_PRICES), "Wood");
});

test("gate match: cypress fence → Cypress gate (specific beats generic vinyl)", () => {
  assert.equal(matchGateType("Vinyl - Privacy - Cypress", GATE_PRICES), "Privacy Vinyl - Cypress");
});

test("gate match: white vinyl → generic Vinyl gate", () => {
  assert.equal(matchGateType("Vinyl - Privacy - White", GATE_PRICES), "Vinyl");
});

test("gate match: Aluminum 6x6 → Aluminum(6ft)", () => {
  assert.equal(matchGateType("Aluminum - 6x6", GATE_PRICES), "Aluminum(6ft)");
});

test("gate match: unknown family falls back to Vinyl", () => {
  assert.equal(matchGateType("Bamboo - Rolled", GATE_PRICES), "Vinyl");
});

test("gate match: empty catalog → null", () => {
  assert.equal(matchGateType("Wood - Dog Ear", []), null);
});

// ── quoteRange ─────────────────────────────────────────────────────────

test("range: −5%/+10% rounded out to $100s", () => {
  // 7395 → lo 7025.25 → 7000; hi 8134.5 → 8200
  assert.deepEqual(quoteRange(7395), { lo: 7000, hi: 8200 });
});

test("range: exact multiples still round out", () => {
  // 1000 → lo 950 → 900; hi 1100 → 1100
  assert.deepEqual(quoteRange(1000), { lo: 900, hi: 1100 });
});

// ── quickTotal ─────────────────────────────────────────────────────────

test("quickTotal matches projectTotal for the same job", () => {
  const inputs = { linearFt: 120, walkGates: 1, doubleGates: 0, tearDown: true, permit: true };
  const quick = quickTotal("Vinyl - Privacy - White", inputs, FENCE_PRICES, GATE_PRICES, SETTINGS);
  const direct = projectTotal(
    {
      laborCostFt: QQ_LABOR_COST_FT,
      profitMargin: QQ_PROFIT_MARGIN,
      permit: true,
      discount: 0,
      sections: [
        { linearFt: 120, type: "Vinyl - Privacy - White", tearDown: true, dump: true, takeDownFt: 120 },
      ],
      gates: [{ type: "Vinyl", style: "Single" }],
      extras: [],
    },
    FENCE_PRICES,
    GATE_PRICES,
    SETTINGS,
  ).total;
  assert.equal(quick, direct);
  assert.equal(quick, 7395); // hand-verified 2026-06-12 (fence 5300 + dump 600 + permit 800 + gate 695)
});

test("quickTotal: unpriced type → null, never $0", () => {
  const inputs = { linearFt: 120, walkGates: 0, doubleGates: 0, tearDown: false, permit: true };
  assert.equal(quickTotal("Chainlink", inputs, FENCE_PRICES, GATE_PRICES, SETTINGS), null);
});

test("quickTotal: no footage → null", () => {
  const inputs = { linearFt: 0, walkGates: 1, doubleGates: 0, tearDown: false, permit: true };
  assert.equal(quickTotal("Wood - Dog Ear", inputs, FENCE_PRICES, GATE_PRICES, SETTINGS), null);
});
