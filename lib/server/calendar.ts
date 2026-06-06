import { JWT } from "google-auth-library";

/**
 * Google Calendar read client — SERVER ONLY.
 * Authenticates as the service account (claude@happy-fence-company.iam.gserviceaccount.com),
 * which the happyfencecompany.com calendar is shared with ("See all event details").
 * Credentials come from env so the key file never ships in the bundle.
 */

const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];

/**
 * Rebuild a valid PEM from however the key was pasted into an env var:
 * quoted or not, \n-escaped, real newlines, or newlines stripped entirely.
 * Pulls out the base64 body, re-wraps it at 64 chars, restores the markers.
 */
export function normalizePrivateKey(raw: string): string {
  let s = raw.trim().replace(/^["']|["']$/g, "").replace(/\\n/g, "\n");
  const begin = "-----BEGIN PRIVATE KEY-----";
  const end = "-----END PRIVATE KEY-----";
  // If markers are present, extract whatever is between them as the body.
  const i = s.indexOf(begin);
  const j = s.indexOf(end);
  let body: string;
  if (i !== -1 && j !== -1) {
    body = s.slice(i + begin.length, j);
  } else {
    body = s; // assume the whole thing is the body
  }
  body = body.replace(/[^A-Za-z0-9+/=]/g, ""); // keep base64 chars only
  const wrapped = body.match(/.{1,64}/g)?.join("\n") ?? body;
  return `${begin}\n${wrapped}\n${end}\n`;
}

function jwtClient(): JWT {
  const email = process.env.GOOGLE_SA_CLIENT_EMAIL;
  const rawKey = process.env.GOOGLE_SA_PRIVATE_KEY;
  if (!email || !rawKey) {
    throw new Error("Missing GOOGLE_SA_CLIENT_EMAIL / GOOGLE_SA_PRIVATE_KEY env vars");
  }
  return new JWT({ email, key: normalizePrivateKey(rawKey), scopes: SCOPES });
}

export interface CalEvent {
  id: string;
  summary?: string;
  location?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  creator?: { email?: string };
}

/** List events in [timeMin, timeMax] (RFC3339), expanding recurrences, all pages. */
export async function listEvents(opts: {
  calendarId: string;
  timeMin: string;
  timeMax: string;
}): Promise<CalEvent[]> {
  const jwt = jwtClient();
  const { token } = await jwt.getAccessToken();
  if (!token) throw new Error("Failed to obtain Google access token");

  const out: CalEvent[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        opts.calendarId,
      )}/events`,
    );
    url.searchParams.set("timeMin", opts.timeMin);
    url.searchParams.set("timeMax", opts.timeMax);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "250");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      throw new Error(`Calendar API ${res.status}: ${(await res.text()).slice(0, 500)}`);
    }
    const json = (await res.json()) as { items?: CalEvent[]; nextPageToken?: string };
    out.push(...(json.items ?? []));
    pageToken = json.nextPageToken;
  } while (pageToken);

  return out;
}
