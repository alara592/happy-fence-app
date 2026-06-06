import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanText,
  isSiteVisit,
  parseClient,
  syncFields,
} from "../lib/server/calendar-sync";
import { normalizePrivateKey } from "../lib/server/calendar";

test("normalizePrivateKey rebuilds a valid PEM from any paste form", () => {
  const body = "A".repeat(200); // stand-in base64 body
  const canonical =
    "-----BEGIN PRIVATE KEY-----\n" +
    (body.match(/.{1,64}/g) as string[]).join("\n") +
    "\n-----END PRIVATE KEY-----\n";
  const real = "-----BEGIN PRIVATE KEY-----\n" + body.match(/.{1,64}/g)!.join("\n") + "\n-----END PRIVATE KEY-----\n";
  const escaped = real.replace(/\n/g, "\\n");
  const stripped = real.replace(/\n/g, ""); // newlines removed entirely
  const quoted = '"' + escaped + '"';
  for (const form of [real, escaped, stripped, quoted]) {
    assert.equal(normalizePrivateKey(form), canonical);
  }
});

test("isSiteVisit matches prefix case-insensitively, ignores others", () => {
  assert.equal(isSiteVisit("Site Visit - Frank Theye"), true);
  assert.equal(isSiteVisit("site visit - lower"), true);
  assert.equal(isSiteVisit("  Site Visit: Spaced"), true);
  assert.equal(isSiteVisit("Dentist appointment"), false);
  assert.equal(isSiteVisit("Re: Site Visit"), false);
});

test("parseClient strips prefix and any separator", () => {
  assert.equal(parseClient("Site Visit - Frank Theye"), "Frank Theye");
  assert.equal(parseClient("Site Visit – Pedro Bravo"), "Pedro Bravo"); // en dash
  assert.equal(parseClient("Site Visit — Rei Leonard"), "Rei Leonard"); // em dash
  assert.equal(parseClient("Site Visit: Tim Knoll"), "Tim Knoll");
  assert.equal(parseClient("Site Visit Miguel Bravo"), "Miguel Bravo");
});

test("cleanText converts breaks, strips tags, decodes entities", () => {
  assert.equal(cleanText("Line 1<br>Line 2"), "Line 1\nLine 2");
  assert.equal(cleanText("<p>Para</p><p>Two</p>"), "Para\nTwo");
  assert.equal(cleanText("Tom &amp; Jerry &lt;3"), "Tom & Jerry <3");
  assert.equal(cleanText("a\n\n\n\nb"), "a\n\nb");
  assert.equal(cleanText(undefined), "");
});

test("syncFields maps event to row, excludes status/project_id", () => {
  const f = syncFields(
    {
      id: "evt1",
      summary: "Site Visit - Frank Theye",
      location: "4901 SW 104th Ave, Miami, FL",
      description: "Call first<br>+1 786 555 1234",
      start: { dateTime: "2026-05-26T16:30:00-04:00" },
      end: { dateTime: "2026-05-26T17:00:00-04:00" },
      creator: { email: "mary@happyfencecompany.com" },
    },
    "2026-06-06T00:00:00.000Z",
  );
  assert.equal(f.client, "Frank Theye");
  assert.equal(f.address, "4901 SW 104th Ave, Miami, FL");
  assert.equal(f.start_at, "2026-05-26T16:30:00-04:00");
  assert.equal(f.end_at, "2026-05-26T17:00:00-04:00");
  assert.equal(f.meeting_title, "Site Visit - Frank Theye");
  assert.equal(f.notes, "Call first\n+1 786 555 1234");
  assert.equal(f.created_by, "mary@happyfencecompany.com");
  assert.equal(f.last_synced, "2026-06-06T00:00:00.000Z");
  // Must NOT carry status or project_id (preserved on update).
  assert.equal("status" in f, false);
  assert.equal("project_id" in f, false);
});

test("syncFields handles all-day events and missing fields", () => {
  const f = syncFields({ id: "e2", summary: "Site Visit - X", start: { date: "2026-06-10" } }, "now");
  assert.equal(f.start_at, "2026-06-10T00:00:00Z");
  assert.equal(f.end_at, null);
  assert.equal(f.address, null);
  assert.equal(f.notes, "");
});
