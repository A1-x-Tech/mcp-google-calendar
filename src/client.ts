import { randomUUID } from "node:crypto";
import type {
  AutoDeclineMode,
  ChatStatus,
  EventTypeFilter,
  GoogleCalendarConfig,
  MinAccessRole,
  ReminderMethod,
  SendUpdates,
} from "./types.js";
import { GoogleCalendarError } from "./types.js";
import { CredentialsError, DEFAULT_BASE } from "./config.js";

/**
 * The slice of the auth component's TokenProvider this client consumes
 * (structurally satisfied by `TokenProvider` from @a1-x-tech/mcp-google-auth).
 * Kept as a local interface so the client stays testable with a plain object
 * and never depends on the component's internals.
 */
export interface AccessTokenProvider {
  /** A valid Bearer token; `true` forces a re-mint (the 401 replay path). */
  getAccessToken(forceRefresh?: boolean): Promise<string>;
  /** True when a 401 replay is worth trying (a refresh token exists). */
  canRefresh(): boolean;
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Google's OAuth2 token endpoint — refresh tokens are exchanged here. */
const TOKEN_URL = "https://oauth2.googleapis.com/token";

/** Query values; an array appends the parameter once per element (e.g. eventTypes). */
type Query = Record<string, string | number | boolean | string[] | undefined>;

/** Maps normalized send_updates to the API's sendUpdates wire value. */
function mapSendUpdates(value: SendUpdates | undefined): string | undefined {
  if (value === undefined) return undefined;
  return { all: "all", external_only: "externalOnly", none: "none" }[value];
}

/** Maps a normalized event-type filter to the API's eventTypes wire value. */
function mapEventType(value: EventTypeFilter): string {
  return {
    default: "default",
    out_of_office: "outOfOffice",
    focus_time: "focusTime",
    working_location: "workingLocation",
    birthday: "birthday",
  }[value];
}

/** Maps the normalized auto-decline policy to the API's autoDeclineMode wire value. */
function mapAutoDecline(value: AutoDeclineMode | undefined): string | undefined {
  if (value === undefined) return undefined;
  return {
    none: "declineNone",
    all: "declineAllConflictingInvitations",
    new: "declineOnlyNewConflictingInvitations",
  }[value];
}

/** Maps the normalized chat status to the API's chatStatus wire value. */
function mapChatStatus(value: ChatStatus | undefined): string | undefined {
  if (value === undefined) return undefined;
  return { available: "available", do_not_disturb: "doNotDisturb" }[value];
}

/** Maps the normalized minimum access role to the API's minAccessRole wire value. */
function mapMinAccessRole(value: MinAccessRole | undefined): string | undefined {
  if (value === undefined) return undefined;
  return { free_busy_reader: "freeBusyReader", reader: "reader", writer: "writer", owner: "owner" }[value];
}

/** Normalized inputs for list_calendars. */
export interface ListCalendarsParams {
  maxResults?: number;
  pageToken?: string;
  minAccessRole?: MinAccessRole;
  showHidden?: boolean;
}

/** Normalized inputs for list_events. */
export interface ListEventsParams {
  calendarId: string;
  /** RFC3339 lower bound on event end time (exclusive of earlier events). */
  timeMin?: string;
  /** RFC3339 upper bound on event start time. */
  timeMax?: string;
  /** Free-text search over summary/description/location/attendees. */
  q?: string;
  /** Expand recurring events into individual instances. */
  singleEvents?: boolean;
  /** start_time requires singleEvents=true. */
  orderBy?: "start_time" | "updated";
  /** IANA time zone the response times are rendered in. */
  timeZone?: string;
  maxResults?: number;
  pageToken?: string;
  showDeleted?: boolean;
  /** RFC3339: only events modified after this moment (for incremental polling). */
  updatedMin?: string;
  eventTypes?: EventTypeFilter[];
}

/** Normalized start/end for an event: an all-day date pair or a timed dateTime pair. */
export interface EventTimes {
  /** All-day start, YYYY-MM-DD. */
  startDate?: string;
  /** All-day end, YYYY-MM-DD — EXCLUSIVE (the day after the last day). */
  endDate?: string;
  /** Timed start, RFC3339. */
  startDateTime?: string;
  /** Timed end, RFC3339. */
  endDateTime?: string;
  /** IANA time zone for the timed pair (required for recurring events). */
  timeZone?: string;
}

/** Common normalized event fields shared by create_event and update_event. */
export interface EventFields extends EventTimes {
  summary?: string;
  description?: string;
  location?: string;
  attendees?: { email: string; optional?: boolean }[];
  /** RRULE/RDATE/EXRULE/EXDATE lines, e.g. ["RRULE:FREQ=WEEKLY;BYDAY=MO"]. */
  recurrence?: string[];
  /** Attach a Google Meet conference. */
  addMeet?: boolean;
  useDefaultReminders?: boolean;
  reminders?: { method: ReminderMethod; minutes: number }[];
  /** opaque = blocks free/busy time, transparent = does not. */
  transparency?: "opaque" | "transparent";
  visibility?: "default" | "public" | "private";
  colorId?: string;
  guestsCanInviteOthers?: boolean;
  guestsCanModify?: boolean;
  guestsCanSeeOtherGuests?: boolean;
}

export interface CreateEventParams extends EventFields {
  calendarId: string;
  summary: string;
  sendUpdates?: SendUpdates;
}

export interface UpdateEventParams extends EventFields {
  calendarId: string;
  eventId: string;
  sendUpdates?: SendUpdates;
}

/** Normalized inputs for list_event_instances. */
export interface ListInstancesParams {
  calendarId: string;
  eventId: string;
  timeMin?: string;
  timeMax?: string;
  timeZone?: string;
  maxResults?: number;
  pageToken?: string;
  showDeleted?: boolean;
}

/** Normalized inputs for query_free_busy. */
export interface FreeBusyParams {
  timeMin: string;
  timeMax: string;
  timeZone?: string;
  calendarIds: string[];
}

/** Normalized inputs for the Out of Office / Focus Time builders. */
export interface AvailabilityBlockParams {
  calendarId: string;
  summary?: string;
  startDateTime: string;
  endDateTime: string;
  timeZone?: string;
  autoDecline?: AutoDeclineMode;
  declineMessage?: string;
  /** Focus Time only. */
  chatStatus?: ChatStatus;
  sendUpdates?: SendUpdates;
}

/**
 * Builds the wire start/end pair from the normalized times. Enforces the two
 * legal shapes — an all-day date pair or a timed dateTime pair — because the
 * API's own error for a mixed shape is cryptic. When `require` is set (create),
 * one complete pair is mandatory; for updates both may be absent.
 */
export function buildEventTimes(
  p: EventTimes,
  require: boolean,
): { start?: Record<string, unknown>; end?: Record<string, unknown> } {
  const hasDate = p.startDate !== undefined || p.endDate !== undefined;
  const hasDateTime = p.startDateTime !== undefined || p.endDateTime !== undefined;
  if (hasDate && hasDateTime) {
    throw new Error(
      "Use either the all-day pair (start_date + end_date) or the timed pair (start_date_time + end_date_time), not both.",
    );
  }
  if (hasDate) {
    if (!p.startDate || !p.endDate) {
      throw new Error("An all-day event needs both start_date and end_date (end_date is exclusive).");
    }
    return { start: { date: p.startDate }, end: { date: p.endDate } };
  }
  if (hasDateTime) {
    if (!p.startDateTime || !p.endDateTime) {
      throw new Error("A timed event needs both start_date_time and end_date_time.");
    }
    return {
      start: compact({ dateTime: p.startDateTime, timeZone: p.timeZone }),
      end: compact({ dateTime: p.endDateTime, timeZone: p.timeZone }),
    };
  }
  if (require) {
    throw new Error(
      "Event times are required: start_date + end_date (all-day) or start_date_time + end_date_time (timed).",
    );
  }
  return {};
}

/**
 * Builds a Calendar API Event resource from the normalized vocabulary shared
 * by create_event and update_event. Pure wire mapping; `requireTimes`
 * distinguishes create (times mandatory) from patch (all fields optional).
 */
export function buildEventBody(p: EventFields, requireTimes: boolean): Record<string, unknown> {
  const { start, end } = buildEventTimes(p, requireTimes);

  let reminders: Record<string, unknown> | undefined;
  if (p.reminders && p.reminders.length > 0) {
    reminders = { useDefault: false, overrides: p.reminders.map((r) => ({ method: r.method, minutes: r.minutes })) };
  } else if (p.useDefaultReminders !== undefined) {
    reminders = { useDefault: p.useDefaultReminders };
  }

  return compact({
    summary: p.summary,
    description: p.description,
    location: p.location,
    start,
    end,
    attendees: p.attendees?.map((a) => compact({ email: a.email, optional: a.optional })),
    recurrence: p.recurrence,
    conferenceData: p.addMeet
      ? { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } }
      : undefined,
    reminders,
    transparency: p.transparency,
    visibility: p.visibility,
    colorId: p.colorId,
    guestsCanInviteOthers: p.guestsCanInviteOthers,
    guestsCanModify: p.guestsCanModify,
    guestsCanSeeOtherGuests: p.guestsCanSeeOtherGuests,
  });
}

export class GoogleCalendarClient {
  private readonly base: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;
  /** Cached access token from the refresh flow, with its expiry. */
  private cachedToken?: { value: string; expiresAt: number };
  /** In-flight refresh, deduping concurrent token requests. */
  private refreshInFlight?: Promise<string>;

  constructor(
    private readonly config: GoogleCalendarConfig,
    /**
     * Fallback token source (the in-chat login of @a1-x-tech/mcp-google-auth).
     * Consulted only when the env-derived config carries no credentials —
     * env wins (component invariant 3), so existing refresh-triple and
     * access-token installs behave exactly as before.
     */
    private readonly tokenProvider?: AccessTokenProvider,
  ) {
    this.base = config.apiBase.endsWith("/") ? config.apiBase : config.apiBase + "/";
    this.timeoutMs = config.timeoutMs ?? 60_000;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryBaseMs = config.retryBaseMs ?? 500;
  }

  private canRefresh(): boolean {
    return Boolean(this.config.refreshToken && this.config.clientId && this.config.clientSecret);
  }

  /**
   * Returns a valid Bearer token. With the refresh triple configured, mints an
   * access token from the refresh token and caches it until shortly before it
   * expires (concurrent callers share one in-flight refresh); otherwise the
   * static GOOGLE_CALENDAR_ACCESS_TOKEN is used as-is. With neither configured,
   * the in-chat-login provider (when wired) resolves the token — it re-reads
   * the stored login per call, so a finish_login taken mid-session works
   * without a restart, and it throws `AuthRequiredError` BEFORE any fetch.
   * With no provider either, throws {@link CredentialsError} BEFORE any fetch —
   * a missing setup must never enter the retry/backoff loop or trigger the 401
   * re-mint, because no amount of retrying mints credentials.
   */
  private async accessToken(forceRefresh = false): Promise<string> {
    if (this.canRefresh()) {
      if (!forceRefresh && this.cachedToken && Date.now() < this.cachedToken.expiresAt) {
        return this.cachedToken.value;
      }
      if (!this.refreshInFlight) {
        this.refreshInFlight = this.refreshAccessToken().finally(() => {
          this.refreshInFlight = undefined;
        });
      }
      return this.refreshInFlight;
    }
    // Env wins over the provider (component invariant 3): a static
    // GOOGLE_CALENDAR_ACCESS_TOKEN keeps behaving exactly as before.
    if (this.config.accessToken) return this.config.accessToken;
    if (this.tokenProvider) return this.tokenProvider.getAccessToken(forceRefresh);
    throw new CredentialsError();
  }

  /**
   * True when a 401 is worth one forced re-mint + replay: either this client
   * can mint from the env refresh triple, or the provider holds a refresh
   * token (env or stored login).
   */
  private canReplayOn401(): boolean {
    if (this.canRefresh()) return true;
    if (this.config.accessToken) return false;
    return this.tokenProvider?.canRefresh() ?? false;
  }

  /** Exchanges the refresh token for a fresh access token at Google's token endpoint. */
  private async refreshAccessToken(): Promise<string> {
    const body = new URLSearchParams({
      client_id: this.config.clientId as string,
      client_secret: this.config.clientSecret as string,
      refresh_token: this.config.refreshToken as string,
      grant_type: "refresh_token",
    }).toString();

    const { res, text } = await this.fetchWithTimeout(
      TOKEN_URL,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body },
      "oauth2 token refresh",
    );

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    if (!res.ok) throw new GoogleCalendarError(res.status, data);

    const token = (data as { access_token?: unknown }).access_token;
    if (typeof token !== "string" || !token) {
      throw new Error("OAuth2 token endpoint returned no access_token.");
    }
    const expiresIn = Number((data as { expires_in?: unknown }).expires_in);
    const ttl = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600;
    // Refresh 60s ahead of the real expiry so requests never race a dying token.
    this.cachedToken = { value: token, expiresAt: Date.now() + Math.max(ttl - 60, 30) * 1000 };
    return token;
  }

  /** Verifies the OAuth credentials by minting a fresh access token (refresh flow only). */
  async authCheck(): Promise<unknown> {
    if (!this.canRefresh()) {
      throw new Error(
        "authCheck needs the refresh flow (GOOGLE_CALENDAR_CLIENT_ID / _CLIENT_SECRET / _REFRESH_TOKEN); with a static GOOGLE_CALENDAR_ACCESS_TOKEN list calendars instead.",
      );
    }
    await this.accessToken(true);
    return { ok: true, auth: "refresh_token" };
  }

  /** Backoff before a retry: honors Retry-After when present, else exponential (capped at 30s). */
  private backoffMs(attempt: number, res?: Response): number {
    const retryAfter = res ? Number(res.headers.get("Retry-After")) : NaN;
    if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter, 30) * 1000;
    return Math.min(this.retryBaseMs * 2 ** attempt, 30_000);
  }

  /**
   * fetch with an AbortController timeout. Reads the response body inside the
   * guarded zone so the timeout also covers a slow or drip-feeding body, not
   * just the initial headers, and returns the text alongside the response.
   */
  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    label: string,
  ): Promise<{ res: Response; text: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      const text = await res.text();
      return { res, text };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Request to "${label}" timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Low-level request to a Google Calendar API path (e.g.
   * "calendar/v3/calendars/primary/events"). Auth is a Bearer token (refreshed
   * transparently; a 401 forces one re-mint + retry). 429 is always retried
   * with backoff; 5xx and network errors/timeouts are retried only for GET —
   * the Calendar API has real writes, and replaying a POST after the write
   * committed would duplicate the event (and re-notify every attendee). Any
   * other non-2xx throws a {@link GoogleCalendarError}.
   */
  async request<T = unknown>(
    method: HttpMethod,
    path: string,
    body?: Record<string, unknown>,
    query?: Query,
  ): Promise<T> {
    // Guard method !== "GET" keeps undici from crashing on a GET-with-body.
    const hasBody = body !== undefined && method !== "GET";

    // Resolve the path against the API base, then reject anything that escaped
    // to a foreign origin (an absolute "https://evil/x" or a "\\evil/x" slipped
    // through raw_request) so the Bearer token can never leak to another host.
    const base = new URL(this.base);
    const url = new URL(path.replace(/^\//, ""), base);
    if (url.origin !== base.origin) {
      throw new Error(`raw_request path must be a relative API path (resolved to foreign origin ${url.origin})`);
    }
    // Pin the path under calendar/v3/. The origin alone is not enough:
    // www.googleapis.com hosts every Google API (drive/v3, gmail/v1, ...), and
    // a broadly-scoped token must not turn raw_request into a generic Google
    // proxy. Checked on the RESOLVED pathname, so "calendar/v3/../../drive"
    // tricks are already normalized away by the URL parser.
    if (!url.pathname.startsWith(base.pathname + "calendar/v3/")) {
      throw new Error(
        `path must stay under "calendar/v3/" (resolved to "${url.pathname}") — this server exposes only the Google Calendar API`,
      );
    }
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          for (const item of value) url.searchParams.append(key, item);
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }
    const target = url.toString();

    // Writes must not be replayed on ambiguous failures (see the retry gate below).
    const idempotent = method === "GET";
    let refreshedOn401 = false;

    for (let attempt = 0; ; attempt++) {
      const token = await this.accessToken();
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (hasBody) headers["Content-Type"] = "application/json";

      let res: Response;
      let text: string;
      try {
        ({ res, text } = await this.fetchWithTimeout(
          target,
          { method, headers, body: hasBody ? JSON.stringify(body) : undefined },
          path,
        ));
      } catch (err) {
        // Network error or timeout: the request may or may not have reached the
        // API, so only reads are retried; writes rethrow immediately.
        if (idempotent && attempt < this.maxRetries) {
          await delay(this.backoffMs(attempt));
          continue;
        }
        throw err;
      }

      // An expired/revoked access token: re-mint once and replay. The request
      // never executed, so this is safe for writes too. The replay is NOT a
      // retry — decrement so the transient budget (maxRetries) stays intact
      // for later 429/5xx/network failures after the re-mint.
      if (res.status === 401 && this.canReplayOn401() && !refreshedOn401) {
        refreshedOn401 = true;
        await this.accessToken(true);
        attempt--;
        continue;
      }

      // 429 means the request was rejected before executing — safe to retry for
      // any method. 5xx is ambiguous (the write may have committed), so it is
      // gated to idempotent requests.
      const transient = res.status === 429 || (idempotent && res.status >= 500 && res.status < 600);
      if (transient && attempt < this.maxRetries) {
        await delay(this.backoffMs(attempt, res));
        continue;
      }

      let data: unknown = undefined;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }

      if (!res.ok) throw new GoogleCalendarError(res.status, data);
      return data as T;
    }
  }

  // ---- Calendars ----

  /** Lists the calendars on the user's calendar list (id, summary, timeZone, accessRole, primary). */
  async listCalendars(p: ListCalendarsParams = {}): Promise<unknown> {
    return this.request(
      "GET",
      "calendar/v3/users/me/calendarList",
      undefined,
      compact({
        maxResults: p.maxResults,
        pageToken: p.pageToken,
        minAccessRole: mapMinAccessRole(p.minAccessRole),
        showHidden: p.showHidden,
      }),
    );
  }

  /** One calendar-list entry: summary, timeZone, accessRole, defaultReminders, primary. */
  async getCalendar(calendarId: string): Promise<unknown> {
    return this.request("GET", `calendar/v3/users/me/calendarList/${encodeURIComponent(calendarId)}`);
  }

  // ---- Events ----

  /** Lists events with time-window, search and recurrence-expansion options. */
  async listEvents(p: ListEventsParams): Promise<unknown> {
    return this.request(
      "GET",
      `calendar/v3/calendars/${encodeURIComponent(p.calendarId)}/events`,
      undefined,
      compact({
        timeMin: p.timeMin,
        timeMax: p.timeMax,
        q: p.q,
        singleEvents: p.singleEvents,
        orderBy: p.orderBy === "start_time" ? "startTime" : p.orderBy,
        timeZone: p.timeZone,
        maxResults: p.maxResults,
        pageToken: p.pageToken,
        showDeleted: p.showDeleted,
        updatedMin: p.updatedMin,
        eventTypes: p.eventTypes?.map(mapEventType),
      }),
    );
  }

  /** One event by id (works for recurring masters and individual instance ids alike). */
  async getEvent(calendarId: string, eventId: string, timeZone?: string): Promise<unknown> {
    return this.request(
      "GET",
      `calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      undefined,
      compact({ timeZone }),
    );
  }

  /**
   * Creates an event. conferenceDataVersion=1 rides along whenever a Meet link
   * is requested — without it the API silently drops conferenceData.
   */
  async createEvent(p: CreateEventParams): Promise<unknown> {
    const body = buildEventBody(p, true);
    return this.request(
      "POST",
      `calendar/v3/calendars/${encodeURIComponent(p.calendarId)}/events`,
      body,
      compact({
        sendUpdates: mapSendUpdates(p.sendUpdates),
        conferenceDataVersion: p.addMeet ? 1 : undefined,
      }),
    );
  }

  /**
   * Partially updates an event via PATCH — only the provided fields change.
   * Patching a nested object (start, end, reminders, attendees) replaces that
   * whole object, so time changes should carry both start and end.
   */
  async updateEvent(p: UpdateEventParams): Promise<unknown> {
    const body = buildEventBody(p, false);
    if (Object.keys(body).length === 0) {
      throw new Error("At least one field to update is required.");
    }
    return this.request(
      "PATCH",
      `calendar/v3/calendars/${encodeURIComponent(p.calendarId)}/events/${encodeURIComponent(p.eventId)}`,
      body,
      compact({
        sendUpdates: mapSendUpdates(p.sendUpdates),
        conferenceDataVersion: p.addMeet ? 1 : undefined,
      }),
    );
  }

  /** Deletes (cancels) an event. The API returns an empty body; a readable receipt is returned instead. */
  async deleteEvent(calendarId: string, eventId: string, sendUpdates?: SendUpdates): Promise<unknown> {
    await this.request(
      "DELETE",
      `calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      undefined,
      compact({ sendUpdates: mapSendUpdates(sendUpdates) }),
    );
    return { deleted: true, calendarId, eventId };
  }

  /** Moves an event to another calendar (events.move; only default events can move). */
  async moveEvent(
    calendarId: string,
    eventId: string,
    destinationCalendarId: string,
    sendUpdates?: SendUpdates,
  ): Promise<unknown> {
    return this.request(
      "POST",
      `calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}/move`,
      undefined,
      compact({ destination: destinationCalendarId, sendUpdates: mapSendUpdates(sendUpdates) }),
    );
  }

  /** Expands one recurring event into its instances (each with its own instance id). */
  async listEventInstances(p: ListInstancesParams): Promise<unknown> {
    return this.request(
      "GET",
      `calendar/v3/calendars/${encodeURIComponent(p.calendarId)}/events/${encodeURIComponent(p.eventId)}/instances`,
      undefined,
      compact({
        timeMin: p.timeMin,
        timeMax: p.timeMax,
        timeZone: p.timeZone,
        maxResults: p.maxResults,
        pageToken: p.pageToken,
        showDeleted: p.showDeleted,
      }),
    );
  }

  // ---- Availability ----

  /** Busy intervals per calendar in a time window (freeBusy.query — a read despite the POST). */
  async queryFreeBusy(p: FreeBusyParams): Promise<unknown> {
    return this.request(
      "POST",
      "calendar/v3/freeBusy",
      compact({
        timeMin: p.timeMin,
        timeMax: p.timeMax,
        timeZone: p.timeZone,
        items: p.calendarIds.map((id) => ({ id })),
      }),
    );
  }

  /** Creates an Out of Office block (Workspace primary calendars only; timed, never all-day). */
  async createOutOfOffice(p: AvailabilityBlockParams): Promise<unknown> {
    return this.createAvailabilityBlock(p, "outOfOffice");
  }

  /** Creates a Focus Time block (Workspace primary calendars only; timed, never all-day). */
  async createFocusTime(p: AvailabilityBlockParams): Promise<unknown> {
    return this.createAvailabilityBlock(p, "focusTime");
  }

  private async createAvailabilityBlock(
    p: AvailabilityBlockParams,
    eventType: "outOfOffice" | "focusTime",
  ): Promise<unknown> {
    const properties = compact({
      autoDeclineMode: mapAutoDecline(p.autoDecline),
      declineMessage: p.declineMessage,
      chatStatus: eventType === "focusTime" ? mapChatStatus(p.chatStatus) : undefined,
    });
    const body = compact({
      eventType,
      summary: p.summary ?? (eventType === "outOfOffice" ? "Out of office" : "Focus time"),
      start: compact({ dateTime: p.startDateTime, timeZone: p.timeZone }),
      end: compact({ dateTime: p.endDateTime, timeZone: p.timeZone }),
      outOfOfficeProperties: eventType === "outOfOffice" && Object.keys(properties).length ? properties : undefined,
      focusTimeProperties: eventType === "focusTime" && Object.keys(properties).length ? properties : undefined,
    });
    return this.request(
      "POST",
      `calendar/v3/calendars/${encodeURIComponent(p.calendarId)}/events`,
      body,
      compact({ sendUpdates: mapSendUpdates(p.sendUpdates) }),
    );
  }
}

/**
 * Light read-only identity check used by the in-chat login's finish_login:
 * reads the primary calendarList entry with an externally supplied access
 * token. The entry's `id` is the account's email address, and the call proves
 * the Calendar API itself answers this token (a plain OIDC userinfo would
 * not). Deliberately a standalone fetch, not a client method: the token comes
 * from the login flow and must not touch the client's credential state — which
 * is also why the base is read from the environment here instead of a config
 * object, mirroring `loadConfig()` so a redirected install (tests, a proxy)
 * verifies against the same host every other request already goes to.
 */
export async function fetchCalendarIdentity(accessToken: string): Promise<{ email?: string }> {
  const base = (process.env.GOOGLE_CALENDAR_API_BASE || DEFAULT_BASE).replace(/\/+$/, "");
  const res = await fetch(`${base}/calendar/v3/users/me/calendarList/primary`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) throw new GoogleCalendarError(res.status, data);
  const id = (data as { id?: unknown }).id;
  return { email: typeof id === "string" ? id : undefined };
}

/** Drops keys whose value is `undefined` so they are not sent to the API. */
function compact<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
