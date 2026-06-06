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

export interface SyncResult {
  total: number; // events in window
  siteVisits: number; // matched the prefix
  created: number;
  updated: number;
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

  return { total: events.length, siteVisits: siteVisits.length, created, updated };
}
