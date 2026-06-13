import { test } from "node:test";
import assert from "node:assert/strict";
import { snapshotFromReference, coerceSnapshot, pricesChangedForProject } from "../lib/snapshot";
import type { ProjectPricingInput } from "../lib/pricing";

const REF = {
  fencePrices: [
    { type: "Vinyl - Privacy - White", perSection: 100, ftPerSection: 6 },
    { type: "Chainlink", perSection: 0, ftPerSection: 10 }, // unpriced
  ],
  gatePrices: [{ type: "Vinyl", style: "Single" as const, price: 695 }],
  settings: { defaultTearDownRate: 3, defaultDumpRate: 3, permitFee: 800 },
};

function input(type: string): ProjectPricingInput {
  return {
    laborCostFt: 12,
    profitMargin: 0.3,
    permit: true,
    discount: 0,
    dumpIncluded: true,
    sections: [
      { linearFt: 120, type, tearDown: true, dump: false, takeDownFt: 120, tearDownRate: null, dumpRate: null },
    ],
    gates: [],
    extras: [],
  };
}

test("snapshotFromReference round-trips through jsonb + coerceSnapshot", () => {
  const snap = snapshotFromReference(REF);
  const back = coerceSnapshot(JSON.parse(JSON.stringify(snap))); // simulate store→read
  assert.deepEqual(back, snap);
});

test("snapshot holds only the three pricing tables (extras catalog dropped)", () => {
  assert.deepEqual(Object.keys(snapshotFromReference(REF)).sort(), ["fencePrices", "gatePrices", "settings"]);
});

test("coerceSnapshot returns null for absent/garbage input", () => {
  assert.equal(coerceSnapshot(null), null);
  assert.equal(coerceSnapshot({ fencePrices: [] }), null); // missing gates/settings
});

test("coerceSnapshot numbers stringified jsonb values", () => {
  const back = coerceSnapshot({
    fencePrices: [{ type: "X", perSection: "100", ftPerSection: "6" }],
    gatePrices: [{ type: "V", style: "Single", price: "695" }],
    settings: { defaultTearDownRate: "3", defaultDumpRate: "3", permitFee: "800" },
  });
  assert.equal(back!.fencePrices[0].perSection, 100);
  assert.equal(back!.settings.permitFee, 800);
});

test("pricesChanged: false when snapshot equals live", () => {
  const snap = snapshotFromReference(REF);
  assert.equal(pricesChangedForProject(snap, REF, input("Vinyl - Privacy - White"), "Vinyl - Privacy - White"), false);
});

test("pricesChanged: true when the active fence price moved", () => {
  const snap = snapshotFromReference(REF);
  const live = { ...REF, fencePrices: [{ type: "Vinyl - Privacy - White", perSection: 110, ftPerSection: 6 }, REF.fencePrices[1]] };
  assert.equal(pricesChangedForProject(snap, live, input("Vinyl - Privacy - White"), "Vinyl - Privacy - White"), true);
});

test("pricesChanged: true when a used global rate moved (permit fee)", () => {
  const snap = snapshotFromReference(REF);
  const live = { ...REF, settings: { ...REF.settings, permitFee: 900 } };
  assert.equal(pricesChangedForProject(snap, live, input("Vinyl - Privacy - White"), "Vinyl - Privacy - White"), true);
});

test("pricesChanged: false when there is no active fence", () => {
  const snap = snapshotFromReference(REF);
  assert.equal(pricesChangedForProject(snap, REF, input("Vinyl - Privacy - White"), null), false);
});

test("pricesChanged: true when the active fence was removed from live prices", () => {
  const snap = snapshotFromReference(REF);
  const live = { ...REF, fencePrices: [REF.fencePrices[1]] }; // White gone
  assert.equal(pricesChangedForProject(snap, live, input("Vinyl - Privacy - White"), "Vinyl - Privacy - White"), true);
});
