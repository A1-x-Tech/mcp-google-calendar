/**
 * The server talks to the Google Calendar API v3
 * (https://www.googleapis.com/calendar/v3, REST over JSON). Auth is Google
 * OAuth 2.0: a Bearer access token, minted on demand from a refresh token via
 * https://oauth2.googleapis.com/token (or a static short-lived access token,
 * mostly for testing).
 */

/**
 * Who gets an email notification about an event write, normalized; the client
 * maps it to the API's sendUpdates wire values (all / externalOnly / none).
 * The API default is none — nobody is notified unless asked.
 */
export type SendUpdates = "all" | "external_only" | "none";

/**
 * Event-type filter values for list_events, normalized; mapped to the wire
 * eventTypes (default / outOfOffice / focusTime / workingLocation / birthday).
 */
export type EventTypeFilter = "default" | "out_of_office" | "focus_time" | "working_location" | "birthday";

/**
 * Auto-decline policy for Out of Office / Focus Time blocks, normalized;
 * mapped to declineNone / declineAllConflictingInvitations /
 * declineOnlyNewConflictingInvitations by the client.
 */
export type AutoDeclineMode = "none" | "all" | "new";

/** Chat presence during Focus Time, normalized; mapped to available / doNotDisturb. */
export type ChatStatus = "available" | "do_not_disturb";

/**
 * Minimum calendar-list access filter, normalized; mapped to the wire
 * minAccessRole (freeBusyReader / reader / writer / owner).
 */
export type MinAccessRole = "free_busy_reader" | "reader" | "writer" | "owner";

/** Reminder channel (API wire values, passed through). */
export type ReminderMethod = "email" | "popup";

export interface GoogleCalendarConfig {
  /** OAuth2 client id (refresh flow). */
  clientId?: string;
  /** OAuth2 client secret (refresh flow). Treated as a secret. */
  clientSecret?: string;
  /** OAuth2 refresh token, exchanged for access tokens. Treated as a secret. */
  refreshToken?: string;
  /** Static access token (short-lived, ~1h). Used only when the refresh triple is absent. Treated as a secret. */
  accessToken?: string;
  /** API root. Defaults to https://www.googleapis.com (paths start with calendar/v3/). */
  apiBase: string;
  /** Per-request timeout in milliseconds. Defaults to 60_000. */
  timeoutMs?: number;
  /** Max retries for transient errors (429 always; 5xx/network for reads). Defaults to 3. */
  maxRetries?: number;
  /** Base backoff in milliseconds, doubled each retry. Defaults to 500. */
  retryBaseMs?: number;
}

/**
 * Google APIs report failures as a non-2xx HTTP status with a JSON envelope
 * ({ error: { code, message, status, details } }); the OAuth token endpoint
 * uses { error, error_description }. The parsed body is kept alongside the
 * status and a short readable message is derived.
 */
export class GoogleCalendarError extends Error {
  readonly status: number;
  readonly body?: unknown;

  constructor(status: number, body: unknown) {
    super(`HTTP ${status}: ${formatErrorBody(body)}`);
    this.name = "GoogleCalendarError";
    this.status = status;
    this.body = body;
  }
}

/** Turns a parsed Google API error body into a short, readable message. */
function formatErrorBody(body: unknown): string {
  if (body == null) return "(no body)";
  if (typeof body === "string") return body.slice(0, 500);
  if (typeof body !== "object") return String(body);
  const obj = body as Record<string, unknown>;

  // OAuth token endpoint style: { error: "invalid_grant", error_description: "..." }
  if (typeof obj.error === "string") {
    const description = typeof obj.error_description === "string" ? `: ${obj.error_description}` : "";
    return `${obj.error}${description}`.slice(0, 500);
  }

  // Google API envelope: { error: { code, message, status, details } }
  const err = (typeof obj.error === "object" && obj.error !== null ? obj.error : obj) as Record<string, unknown>;
  if (typeof err.message === "string") {
    const status = typeof err.status === "string" ? `[${err.status}] ` : "";
    return `${status}${err.message}`.slice(0, 500);
  }

  return JSON.stringify(obj).slice(0, 500);
}
