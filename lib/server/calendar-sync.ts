import { db } from "./db";
import { listEvents, type CalEvent } from "./calendar";

/**
 * Google Calendar → appointments sync. One-way; upserts on calendar_event_id so
 * re-runs UPDATE the matching row instead of duplicating. Direct port of
 * `Big Ant Fencing/calendar-sync.gs` (the proven AppSheet logic).
 *
 * Only "Site Visit ..." events sync (personal events ignored). On update we refresh
 * ONLY the sync fields — `status` and `project_id` are preserved so app-side workflow
 * (a status change, a linked project) survives a re-sync.
 *
 * Deletions: after the upsert we reconcile the sync window — an in-window appointment
 * the calendar no longer returns (deleted, renamed off "Site Visit", or moved out of
 * window) is marked `Cancelled` instead of left stale; one that reappears flips back to
 * `Scheduled`. The row (and any linked project) is kept either way. Reconcile only ever
 * toggles Scheduled↔Cancelled, so it never clobbers other app-set statuses.
 */

export const TITLE_PREFIX = "Site Visit";
const DAYS_BACK = 14;
const DAYS_FORWARD = 120;

/** Calendar HTML description → clean plain text (matches the .gs cleanText_). */
export function cleanText(s?: string): string {
  if (!s) return "";
  return String(s)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Title starts with the prefix (case-insensitive). */
export function isSiteVisit(title: string): boolean {
  return title.trim().toLowerCase().startsWith(TITLE_PREFIX.toLowerCase());
}

/** Client = title after the prefix, leading separator (-, en/em dash, :) stripped. */
export function parseClient(title: string): string {
  return title.trim().substring(TITLE_PREFIX.length).replace(/^[\s\-–—:]+/, "").trim();
}

/** RFC3339 instant from a calendar start/end (dateTime, or all-day date at midnight). */
function instant(t?: { dateTime?: string; date?: string }): string | null {
  if (t?.dateTime) return t.dateTime;
  if (t?.date) return `${t.date}T00:00:00Z`;
  return null;
}

/** Sync fields refreshed on every run — calendar is source of truth for these. */
export function syncFields(ev: CalEvent, nowIso: string) {
  const title = (ev.summary || "").trim();
  return {
    client: parseClient(title),
    address: ev.location || null,
    start_at: instant(ev.start),
    end_at: instant(ev.end),
    meeting_title: title,
    notes: cleanText(ev.description),
    source: "Google Calendar",
    created_by: ev.creator?.email || null,
    last_synced: nowIso,
  };
}

/**
 * Pure deletion-reconcile diff: given the in-window appointment rows and the set of
 * event IDs the calendar returned this run, decide which rows to cancel (Scheduled but
 * gone) and which to resurrect (Cancelled but back). Only toggles Scheduled↔Cancelled.
 */
export function reconcile(
  rows: { id: string; calendar_event_id: string; status: string }[],
  seenIds: Iterable<string>,
): { toCancel: string[]; toResurrect: string[] } {
  const seen = new Set(seenIds);
  const toCancel: string[] = [];
  const toResurrect: string[] = [];
  for (const a of rows) {
    if (a.status === "Scheduled" && !seen.has(a.calendar_event_id)) toCancel.push(a.id);
    else if (a.status === "Cancelled" && seen.has(a.calendar_event_id)) toResurrect.push(a.id);
  }
  return { toCancel, toResurrect };
}

export interface SyncResult {
  total: number; // events in window
  siteVisits: number; // matched the prefix
  created: number;
  updated: number;
  cancelled: number; // in-window rows the calendar no longer returns
  resurrected: number; // previously-cancelled rows that reappeared
}

export async function syncAppointments(): Promise<SyncResult> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID || "anthony@happyfencecompany.com";
  const now = new Date();
  const timeMin = new Date(now.getTime() - DAYS_BACK * 86400000).toISOString();
  const timeMax = new Date(now.getTime() + DAYS_FORWARD * 86400000).toISOString();

  const events = await listEvents({ calendarId, timeMin, timeMax });
  const siteVisits = events.filter((e) => isSiteVisit(e.summary || ""));

  // Which event IDs already exist (to branch insert vs update).
  const ids = siteVisits.map((e) => e.id);
  const existing = new Set<string>();
  if (ids.length) {
    const { data, error } = await db()
      .from("appointments")
      .select("calendar_event_id")
      .in("calendar_event_id", ids);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) existing.add(r.calendar_event_id as string);
  }

  const nowIso = now.toISOString();
  let created = 0;
  let updated = 0;

  for (const ev of siteVisits) {
    const fields = syncFields(ev, nowIso);
    if (existing.has(ev.id)) {
      const { error } = await db()
        .from("appointments")
        .update(fields)
        .eq("calendar_event_id", ev.id);
      if (error) throw new Error(error.message);
      updated++;
    } else {
      const { error } = await db()
        .from("appointments")
        .insert({ calendar_event_id: ev.id, status: "Scheduled", ...fields });
      if (error) throw new Error(error.message);
      created++;
    }
  }

  // ── Reconcile deletions across the sync window ──
  // Compare in-window appointments against the event IDs the calendar just returned.
  // Missing + Scheduled → Cancelled; present + Cancelled → Scheduled (reappeared).
  const { data: inWindow, error: wErr } = await db()
    .from("appointments")
    .select("id, calendar_event_id, status")
    .gte("start_at", timeMin)
    .lt("start_at", timeMax);
  if (wErr) throw new Error(wErr.message);

  const { toCancel, toResurrect } = reconcile(
    (inWindow ?? []) as { id: string; calendar_event_id: string; status: string }[],
    ids,
  );

  if (toCancel.length) {
    const { error } = await db().from("appointments").update({ status: "Cancelled" }).in("id", toCancel);
    if (error) throw new Error(error.message);
  }
  if (toResurrect.length) {
    const { error } = await db().from("appointments").update({ status: "Scheduled" }).in("id", toResurrect);
    if (error) throw new Error(error.message);
  }

  return {
    total: events.length,
    siteVisits: siteVisits.length,
    created,
    updated,
    cancelled: toCancel.length,
    resurrected: toResurrect.length,
  };
}
