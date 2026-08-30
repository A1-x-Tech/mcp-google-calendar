import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildEventBody,
  buildEventTimes,
  fetchCalendarIdentity,
  GoogleCalendarClient,
  type AccessTokenProvider,
} from "./client.js";
import { CredentialsError, MISSING_CREDENTIALS_MESSAGE } from "./config.js";
import type { GoogleCalendarConfig } from "./types.js";

const BASE = "https://www.googleapis.com";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

type Call = { url: string; method: string; auth: unknown; body: string | undefined };

/** A client on a static access token — no token-endpoint traffic expected. */
function staticConfig(extra: Partial<GoogleCalendarConfig> = {}): GoogleCalendarConfig {
  return { accessToken: "STATIC", apiBase: BASE, maxRetries: 0, retryBaseMs: 0, ...extra };
}

/** A client on the refresh flow. */
function refreshConfig(extra: Partial<GoogleCalendarConfig> = {}): GoogleCalendarConfig {
  return {
    clientId: "cid",
    clientSecret: "csec",
    refreshToken: "rtok",
    apiBase: BASE,
    maxRetries: 0,
    retryBaseMs: 0,
    ...extra,
  };
}

/** Installs a recording fetch stub; the handler decides each response. */
function mockFetch(handler: (url: string, init: RequestInit, n: number) => Response | Promise<Response>) {
  const original = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = (async (url: unknown, init: unknown) => {
    const i = (init ?? {}) as RequestInit & { headers?: Record<string, string> };
    calls.push({
      url: String(url),
      method: String(i.method),
      auth: i.headers?.Authorization,
      body: typeof i.body === "string" ? i.body : undefined,
    });
    return handler(String(url), i, calls.length);
  }) as typeof fetch;
  return {
    calls,
    restore() {
      globalThis.fetch = original;
    },
  };
}

const okJson = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });

/** Default handler: token endpoint mints TOK-1, everything else returns { ok: true }. */
function defaultHandler(url: string): Response {
  if (url === TOKEN_URL) return okJson({ access_token: "TOK-1", expires_in: 3600 });
  return okJson({ ok: true });
}

// ---- Auth ----

/**
 * The degraded-start contract: a server without credentials still runs, so the
 * client must fail the call itself — with the exact actionable message, before
 * any fetch. Zero fetch calls proves the error skips the retry/backoff loop
 * and the forced 401 re-mint alike (maxRetries is deliberately non-zero here).
 */
test("no credentials at all: CredentialsError with the exact text, fetch never called", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    const client = new GoogleCalendarClient({ apiBase: BASE, maxRetries: 3, retryBaseMs: 0 });
    await assert.rejects(
      () => client.listCalendars(),
      (err: unknown) => {
        assert.ok(err instanceof CredentialsError, "must be a CredentialsError");
        assert.equal(err.message, MISSING_CREDENTIALS_MESSAGE);
        // The message is the product: it must name the variables and the restart.
        assert.ok(
          err.message.startsWith(
            "Google OAuth credentials are required: set GOOGLE_CALENDAR_CLIENT_ID + " +
              "GOOGLE_CALENDAR_CLIENT_SECRET + GOOGLE_CALENDAR_REFRESH_TOKEN (recommended), " +
              "or GOOGLE_CALENDAR_ACCESS_TOKEN with a short-lived access token.",
          ),
          "the message must open with the variables to set",
        );
        assert.match(err.message, /restart the server/, "the fix must mention the restart");
        return true;
      },
    );
    assert.equal(mock.calls.length, 0, "must not fetch at all — no retries, no token mint, no replay");
  } finally {
    mock.restore();
  }
});

test("static access token: Bearer header, no token-endpoint traffic", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleCalendarClient(staticConfig()).getCalendar("primary");
    assert.equal(mock.calls.length, 1);
    assert.equal(mock.calls[0].url, `${BASE}/calendar/v3/users/me/calendarList/primary`);
    assert.equal(mock.calls[0].method, "GET");
    assert.equal(mock.calls[0].auth, "Bearer STATIC");
  } finally {
    mock.restore();
  }
});

test("refresh flow: mints a token first, then caches it across requests", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    const client = new GoogleCalendarClient(refreshConfig());
    await client.getCalendar("primary");
    await client.getCalendar("work@example.com");

    const tokenCalls = mock.calls.filter((c) => c.url === TOKEN_URL);
    assert.equal(tokenCalls.length, 1, "the second request must reuse the cached token");
    assert.equal(tokenCalls[0].method, "POST");
    const params = new URLSearchParams(tokenCalls[0].body);
    assert.equal(params.get("grant_type"), "refresh_token");
    assert.equal(params.get("client_id"), "cid");
    assert.equal(params.get("client_secret"), "csec");
    assert.equal(params.get("refresh_token"), "rtok");

    const apiCalls = mock.calls.filter((c) => c.url.startsWith(`${BASE}/`));
    assert.equal(apiCalls.length, 2);
    for (const call of apiCalls) assert.equal(call.auth, "Bearer TOK-1");
  } finally {
    mock.restore();
  }
});

test("a 401 forces one re-mint and replays the request", async () => {
  let minted = 0;
  let apiHits = 0;
  const mock = mockFetch((url) => {
    if (url === TOKEN_URL) {
      minted++;
      return okJson({ access_token: `TOK-${minted}`, expires_in: 3600 });
    }
    apiHits++;
    if (apiHits === 1) return new Response('{"error":{"message":"expired"}}', { status: 401 });
    return okJson({ ok: true });
  });
  try {
    const result = await new GoogleCalendarClient(refreshConfig()).getCalendar("primary");
    assert.deepEqual(result, { ok: true });
    assert.equal(minted, 2, "the 401 must force a second mint");
    const lastApi = mock.calls.filter((c) => c.url.startsWith(`${BASE}/`)).at(-1);
    assert.equal(lastApi?.auth, "Bearer TOK-2");
  } finally {
    mock.restore();
  }
});

test("a persistent 401 throws instead of looping", async () => {
  let apiHits = 0;
  const mock = mockFetch((url) => {
    if (url === TOKEN_URL) return okJson({ access_token: "TOK", expires_in: 3600 });
    apiHits++;
    return new Response('{"error":{"message":"nope","status":"UNAUTHENTICATED"}}', { status: 401 });
  });
  try {
    await assert.rejects(
      () => new GoogleCalendarClient(refreshConfig()).getCalendar("primary"),
      /HTTP 401: \[UNAUTHENTICATED\] nope/,
    );
    assert.equal(apiHits, 2, "exactly one replay after the forced re-mint");
  } finally {
    mock.restore();
  }
});

test("the 401 re-mint replay does not consume a transient retry attempt", async () => {
  let minted = 0;
  let apiHits = 0;
  const mock = mockFetch((url) => {
    if (url === TOKEN_URL) {
      minted++;
      return okJson({ access_token: `TOK-${minted}`, expires_in: 3600 });
    }
    apiHits++;
    if (apiHits === 1) return new Response('{"error":{"message":"expired"}}', { status: 401 });
    if (apiHits === 2) return new Response("slow down", { status: 429 });
    return okJson({ ok: true });
  });
  try {
    // maxRetries: 1 — if the replay ate an attempt, the single 429 retry
    // would be gone and this call would throw HTTP 429.
    const result = await new GoogleCalendarClient(refreshConfig({ maxRetries: 1 })).getCalendar("primary");
    assert.deepEqual(result, { ok: true });
    assert.equal(minted, 2, "the 401 must force a second mint");
    assert.equal(apiHits, 3, "the replay must leave the full retry budget for the 429");
  } finally {
    mock.restore();
  }
});

test("a failed token exchange surfaces the OAuth error", async () => {
  const mock = mockFetch((url) => {
    if (url === TOKEN_URL) {
      return new Response('{"error":"invalid_grant","error_description":"Token has been revoked."}', {
        status: 400,
      });
    }
    return okJson({ ok: true });
  });
  try {
    await assert.rejects(
      () => new GoogleCalendarClient(refreshConfig()).getCalendar("primary"),
      /HTTP 400: invalid_grant: Token has been revoked\./,
    );
  } finally {
    mock.restore();
  }
});

// ---- Auth via the in-chat-login TokenProvider ----

/** A fake @a1-x-tech/mcp-google-auth TokenProvider recording its calls. */
function fakeProvider(tokens: {
  normal?: string;
  forced?: string;
  refreshable?: boolean;
  error?: Error;
}): AccessTokenProvider & { calls: boolean[] } {
  const calls: boolean[] = [];
  // Mirrors the real provider: a forced re-mint replaces the token the next
  // plain call returns (the stored file is re-read per call there).
  let current = tokens.normal ?? "TOK";
  return {
    calls,
    async getAccessToken(forceRefresh = false) {
      calls.push(forceRefresh);
      if (tokens.error) throw tokens.error;
      if (forceRefresh) current = tokens.forced ?? current;
      return current;
    },
    canRefresh: () => tokens.refreshable ?? true,
  };
}

test("no env credentials + provider: the token comes from the in-chat login", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    const provider = fakeProvider({ normal: "LOGIN-TOK" });
    const client = new GoogleCalendarClient({ apiBase: BASE, maxRetries: 0, retryBaseMs: 0 }, provider);
    await client.getCalendar("primary");
    assert.equal(mock.calls.length, 1);
    assert.equal(mock.calls[0].auth, "Bearer LOGIN-TOK");
    assert.deepEqual(provider.calls, [false], "one plain (unforced) token request");
  } finally {
    mock.restore();
  }
});

test("env credentials beat the provider (component invariant 3)", async () => {
  // A static env access token: the provider must never be consulted.
  const mock = mockFetch(defaultHandler);
  try {
    const provider = fakeProvider({ normal: "LOGIN-TOK" });
    await new GoogleCalendarClient(staticConfig(), provider).getCalendar("primary");
    assert.equal(mock.calls[0].auth, "Bearer STATIC");
    assert.equal(provider.calls.length, 0, "env access token wins — provider untouched");
  } finally {
    mock.restore();
  }

  // The env refresh triple: minted at the token endpoint, provider untouched.
  const mock2 = mockFetch(defaultHandler);
  try {
    const provider = fakeProvider({ normal: "LOGIN-TOK" });
    await new GoogleCalendarClient(refreshConfig(), provider).getCalendar("primary");
    const lastApi = mock2.calls.filter((c) => c.url.startsWith(`${BASE}/`)).at(-1);
    assert.equal(lastApi?.auth, "Bearer TOK-1");
    assert.equal(provider.calls.length, 0, "env refresh triple wins — provider untouched");
  } finally {
    mock2.restore();
  }
});

test("a provider AuthRequiredError propagates before any fetch — no retries, no replay", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    const error = Object.assign(new Error("Google account is not connected: no access token."), {
      name: "AuthRequiredError",
    });
    const client = new GoogleCalendarClient(
      { apiBase: BASE, maxRetries: 3, retryBaseMs: 0 },
      fakeProvider({ error }),
    );
    await assert.rejects(
      () => client.listCalendars(),
      (err: unknown) => {
        assert.equal((err as Error).name, "AuthRequiredError", "the component's error must pass through untouched");
        assert.match((err as Error).message, /not connected/);
        return true;
      },
    );
    assert.equal(mock.calls.length, 0, "must not fetch at all — no retries, no token mint, no replay");
  } finally {
    mock.restore();
  }
});

test("a 401 on a provider-backed request forces getAccessToken(true) and replays once", async () => {
  let apiHits = 0;
  const mock = mockFetch(() => {
    apiHits++;
    if (apiHits === 1) return new Response('{"error":{"message":"expired"}}', { status: 401 });
    return okJson({ ok: true });
  });
  try {
    const provider = fakeProvider({ normal: "STALE", forced: "FRESH" });
    const client = new GoogleCalendarClient({ apiBase: BASE, maxRetries: 0, retryBaseMs: 0 }, provider);
    const result = await client.getCalendar("primary");
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(provider.calls, [false, true, false], "one forced re-mint between the 401 and the replay");
    assert.equal(mock.calls.at(-1)?.auth, "Bearer FRESH");
  } finally {
    mock.restore();
  }
});

test("a 401 is not replayed when the provider cannot refresh (static stored token)", async () => {
  let apiHits = 0;
  const mock = mockFetch(() => {
    apiHits++;
    return new Response('{"error":{"message":"nope","status":"UNAUTHENTICATED"}}', { status: 401 });
  });
  try {
    const provider = fakeProvider({ normal: "STATIC-STORED", refreshable: false });
    const client = new GoogleCalendarClient({ apiBase: BASE, maxRetries: 0, retryBaseMs: 0 }, provider);
    await assert.rejects(() => client.getCalendar("primary"), /HTTP 401/);
    assert.equal(apiHits, 1, "no replay without a refresh token to re-mint from");
  } finally {
    mock.restore();
  }
});

test("fetchCalendarIdentity reads the primary calendarList entry and returns its id as email", async () => {
  const mock = mockFetch((url) => {
    assert.equal(url, `${BASE}/calendar/v3/users/me/calendarList/primary`);
    return okJson({ id: "user@example.com", summary: "user@example.com" });
  });
  try {
    assert.deepEqual(await fetchCalendarIdentity("FRESH-TOK"), { email: "user@example.com" });
    assert.equal(mock.calls[0].auth, "Bearer FRESH-TOK");
  } finally {
    mock.restore();
  }

  const mock2 = mockFetch(
    () => new Response('{"error":{"message":"denied","status":"PERMISSION_DENIED"}}', { status: 403 }),
  );
  try {
    await assert.rejects(() => fetchCalendarIdentity("FRESH-TOK"), /HTTP 403: \[PERMISSION_DENIED\] denied/);
  } finally {
    mock2.restore();
  }
});

// The identity check is a standalone fetch outside the client, so it has its
// own base resolution — and it must agree with loadConfig(), or a redirected
// install verifies a login against a host it never talks to afterwards.
test("fetchCalendarIdentity honours GOOGLE_CALENDAR_API_BASE", async () => {
  const previous = process.env.GOOGLE_CALENDAR_API_BASE;
  process.env.GOOGLE_CALENDAR_API_BASE = "https://calendar.test/";
  const mock = mockFetch((url) => {
    // The trailing slash of the override must not survive into the path.
    assert.equal(url, "https://calendar.test/calendar/v3/users/me/calendarList/primary");
    return okJson({ id: "user@example.com" });
  });
  try {
    assert.deepEqual(await fetchCalendarIdentity("FRESH-TOK"), { email: "user@example.com" });
  } finally {
    mock.restore();
    if (previous === undefined) delete process.env.GOOGLE_CALENDAR_API_BASE;
    else process.env.GOOGLE_CALENDAR_API_BASE = previous;
  }
});

// ---- Calendars ----

test("listCalendars maps min_access_role and pagination to the wire query", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleCalendarClient(staticConfig()).listCalendars({
      maxResults: 50,
      pageToken: "tok",
      minAccessRole: "free_busy_reader",
      showHidden: true,
    });
    const url = new URL(mock.calls[0].url);
    assert.equal(url.pathname, "/calendar/v3/users/me/calendarList");
    assert.equal(url.searchParams.get("maxResults"), "50");
    assert.equal(url.searchParams.get("pageToken"), "tok");
    assert.equal(url.searchParams.get("minAccessRole"), "freeBusyReader");
    assert.equal(url.searchParams.get("showHidden"), "true");
    assert.equal(mock.calls[0].method, "GET");
  } finally {
    mock.restore();
  }
});

// ---- Events: reads ----

test("listEvents maps order_by and repeats mapped eventTypes", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleCalendarClient(staticConfig()).listEvents({
      calendarId: "team@example.com",
      timeMin: "2026-09-01T00:00:00Z",
      timeMax: "2026-09-08T00:00:00Z",
      q: "standup",
      singleEvents: true,
      orderBy: "start_time",
      timeZone: "Europe/Berlin",
      maxResults: 10,
      showDeleted: true,
      updatedMin: "2026-08-01T00:00:00Z",
      eventTypes: ["out_of_office", "focus_time"],
    });
    const url = new URL(mock.calls[0].url);
    assert.equal(url.pathname, "/calendar/v3/calendars/team%40example.com/events");
    assert.equal(url.searchParams.get("timeMin"), "2026-09-01T00:00:00Z");
    assert.equal(url.searchParams.get("timeMax"), "2026-09-08T00:00:00Z");
    assert.equal(url.searchParams.get("q"), "standup");
    assert.equal(url.searchParams.get("singleEvents"), "true");
    assert.equal(url.searchParams.get("orderBy"), "startTime");
    assert.equal(url.searchParams.get("timeZone"), "Europe/Berlin");
    assert.equal(url.searchParams.get("maxResults"), "10");
    assert.equal(url.searchParams.get("showDeleted"), "true");
    assert.equal(url.searchParams.get("updatedMin"), "2026-08-01T00:00:00Z");
    assert.deepEqual(url.searchParams.getAll("eventTypes"), ["outOfOffice", "focusTime"]);
  } finally {
    mock.restore();
  }
});

test("getEvent hits the event path with the optional render zone", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleCalendarClient(staticConfig()).getEvent("primary", "evt_1", "Asia/Tokyo");
    const url = new URL(mock.calls[0].url);
    assert.equal(url.pathname, "/calendar/v3/calendars/primary/events/evt_1");
    assert.equal(url.searchParams.get("timeZone"), "Asia/Tokyo");
  } finally {
    mock.restore();
  }
});

test("listEventInstances expands a series with a bounded window", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleCalendarClient(staticConfig()).listEventInstances({
      calendarId: "primary",
      eventId: "master1",
      timeMin: "2026-09-01T00:00:00Z",
      timeMax: "2026-10-01T00:00:00Z",
      showDeleted: true,
    });
    const url = new URL(mock.calls[0].url);
    assert.equal(url.pathname, "/calendar/v3/calendars/primary/events/master1/instances");
    assert.equal(url.searchParams.get("timeMin"), "2026-09-01T00:00:00Z");
    assert.equal(url.searchParams.get("showDeleted"), "true");
    assert.equal(mock.calls[0].method, "GET");
  } finally {
    mock.restore();
  }
});

// ---- Events: writes ----

test("createEvent posts a timed event with attendees, zone and sendUpdates mapping", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleCalendarClient(staticConfig()).createEvent({
      calendarId: "primary",
      summary: "Design review",
      description: "Weekly",
      location: "Room 4",
      startDateTime: "2026-09-01T10:00:00Z",
      endDateTime: "2026-09-01T11:00:00Z",
      timeZone: "Europe/Berlin",
      attendees: [{ email: "a@example.com" }, { email: "b@example.com", optional: true }],
      sendUpdates: "external_only",
      transparency: "transparent",
      visibility: "private",
      colorId: "5",
      guestsCanModify: true,
    });
    const url = new URL(mock.calls[0].url);
    assert.equal(url.pathname, "/calendar/v3/calendars/primary/events");
    assert.equal(url.searchParams.get("sendUpdates"), "externalOnly");
    assert.equal(url.searchParams.get("conferenceDataVersion"), null, "no Meet requested — no version bump");
    assert.equal(mock.calls[0].method, "POST");
    assert.deepEqual(JSON.parse(mock.calls[0].body!), {
      summary: "Design review",
      description: "Weekly",
      location: "Room 4",
      start: { dateTime: "2026-09-01T10:00:00Z", timeZone: "Europe/Berlin" },
      end: { dateTime: "2026-09-01T11:00:00Z", timeZone: "Europe/Berlin" },
      attendees: [{ email: "a@example.com" }, { email: "b@example.com", optional: true }],
      transparency: "transparent",
      visibility: "private",
      colorId: "5",
      guestsCanModify: true,
    });
  } finally {
    mock.restore();
  }
});

test("createEvent with add_meet sends conferenceDataVersion=1 and a createRequest", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleCalendarClient(staticConfig()).createEvent({
      calendarId: "primary",
      summary: "Sync",
      startDateTime: "2026-09-01T10:00:00Z",
      endDateTime: "2026-09-01T10:30:00Z",
      addMeet: true,
    });
    const url = new URL(mock.calls[0].url);
    assert.equal(url.searchParams.get("conferenceDataVersion"), "1");
    const body = JSON.parse(mock.calls[0].body!) as {
      conferenceData: { createRequest: { requestId?: string; conferenceSolutionKey?: { type?: string } } };
    };
    assert.equal(body.conferenceData.createRequest.conferenceSolutionKey?.type, "hangoutsMeet");
    assert.ok(body.conferenceData.createRequest.requestId, "a unique requestId is required by the API");
  } finally {
    mock.restore();
  }
});

test("createEvent builds an all-day event and maps reminders", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleCalendarClient(staticConfig()).createEvent({
      calendarId: "primary",
      summary: "Conference",
      startDate: "2026-09-05",
      endDate: "2026-09-07",
      recurrence: ["RRULE:FREQ=YEARLY"],
      reminders: [{ method: "email", minutes: 1440 }],
    });
    assert.deepEqual(JSON.parse(mock.calls[0].body!), {
      summary: "Conference",
      start: { date: "2026-09-05" },
      end: { date: "2026-09-07" },
      recurrence: ["RRULE:FREQ=YEARLY"],
      reminders: { useDefault: false, overrides: [{ method: "email", minutes: 1440 }] },
    });
  } finally {
    mock.restore();
  }
});

test("createEvent rejects mixed, half or missing time pairs before any fetch", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    const client = new GoogleCalendarClient(staticConfig());
    await assert.rejects(
      () =>
        client.createEvent({
          calendarId: "primary",
          summary: "X",
          startDate: "2026-09-05",
          startDateTime: "2026-09-05T10:00:00Z",
          endDateTime: "2026-09-05T11:00:00Z",
        }),
      /not both/,
    );
    await assert.rejects(
      () => client.createEvent({ calendarId: "primary", summary: "X", startDate: "2026-09-05" }),
      /both start_date and end_date/,
    );
    await assert.rejects(
      () => client.createEvent({ calendarId: "primary", summary: "X", startDateTime: "2026-09-05T10:00:00Z" }),
      /both start_date_time and end_date_time/,
    );
    await assert.rejects(
      () => client.createEvent({ calendarId: "primary", summary: "X" }),
      /Event times are required/,
    );
    assert.equal(mock.calls.length, 0, "validation failures must not reach the API");
  } finally {
    mock.restore();
  }
});

test("updateEvent PATCHes only the provided fields and demands at least one", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    const client = new GoogleCalendarClient(staticConfig());
    await client.updateEvent({
      calendarId: "primary",
      eventId: "evt_1",
      summary: "New title",
      startDateTime: "2026-09-02T10:00:00Z",
      endDateTime: "2026-09-02T11:00:00Z",
      sendUpdates: "all",
    });
    const url = new URL(mock.calls[0].url);
    assert.equal(url.pathname, "/calendar/v3/calendars/primary/events/evt_1");
    assert.equal(url.searchParams.get("sendUpdates"), "all");
    assert.equal(mock.calls[0].method, "PATCH");
    assert.deepEqual(JSON.parse(mock.calls[0].body!), {
      summary: "New title",
      start: { dateTime: "2026-09-02T10:00:00Z" },
      end: { dateTime: "2026-09-02T11:00:00Z" },
    });
    await assert.rejects(
      () => client.updateEvent({ calendarId: "primary", eventId: "evt_1" }),
      /At least one field/,
    );
    assert.equal(mock.calls.length, 1, "the empty update must not reach the API");
  } finally {
    mock.restore();
  }
});

test("updateEvent can switch default reminders back on", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleCalendarClient(staticConfig()).updateEvent({
      calendarId: "primary",
      eventId: "evt_1",
      useDefaultReminders: true,
    });
    assert.deepEqual(JSON.parse(mock.calls[0].body!), { reminders: { useDefault: true } });
  } finally {
    mock.restore();
  }
});

test("deleteEvent maps sendUpdates and returns a readable receipt", async () => {
  const mock = mockFetch(() => new Response(null, { status: 204 }));
  try {
    const result = await new GoogleCalendarClient(staticConfig()).deleteEvent("primary", "evt_1", "all");
    const url = new URL(mock.calls[0].url);
    assert.equal(url.pathname, "/calendar/v3/calendars/primary/events/evt_1");
    assert.equal(url.searchParams.get("sendUpdates"), "all");
    assert.equal(mock.calls[0].method, "DELETE");
    assert.deepEqual(result, { deleted: true, calendarId: "primary", eventId: "evt_1" });
  } finally {
    mock.restore();
  }
});

test("moveEvent posts to /move with the destination in the query", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleCalendarClient(staticConfig()).moveEvent("primary", "evt_1", "team@example.com", "none");
    const url = new URL(mock.calls[0].url);
    assert.equal(url.pathname, "/calendar/v3/calendars/primary/events/evt_1/move");
    assert.equal(url.searchParams.get("destination"), "team@example.com");
    assert.equal(url.searchParams.get("sendUpdates"), "none");
    assert.equal(mock.calls[0].method, "POST");
    assert.equal(mock.calls[0].body, undefined);
  } finally {
    mock.restore();
  }
});

// ---- Availability ----

test("queryFreeBusy posts the window and calendar ids as items", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleCalendarClient(staticConfig()).queryFreeBusy({
      timeMin: "2026-09-01T00:00:00Z",
      timeMax: "2026-09-02T00:00:00Z",
      timeZone: "Europe/Berlin",
      calendarIds: ["primary", "a@example.com"],
    });
    assert.equal(mock.calls[0].url, `${BASE}/calendar/v3/freeBusy`);
    assert.equal(mock.calls[0].method, "POST");
    assert.deepEqual(JSON.parse(mock.calls[0].body!), {
      timeMin: "2026-09-01T00:00:00Z",
      timeMax: "2026-09-02T00:00:00Z",
      timeZone: "Europe/Berlin",
      items: [{ id: "primary" }, { id: "a@example.com" }],
    });
  } finally {
    mock.restore();
  }
});

test("createOutOfOffice maps the auto-decline vocabulary and defaults the title", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleCalendarClient(staticConfig()).createOutOfOffice({
      calendarId: "primary",
      startDateTime: "2026-09-01T00:00:00Z",
      endDateTime: "2026-09-05T00:00:00Z",
      timeZone: "Europe/Berlin",
      autoDecline: "all",
      declineMessage: "On vacation",
    });
    assert.deepEqual(JSON.parse(mock.calls[0].body!), {
      eventType: "outOfOffice",
      summary: "Out of office",
      start: { dateTime: "2026-09-01T00:00:00Z", timeZone: "Europe/Berlin" },
      end: { dateTime: "2026-09-05T00:00:00Z", timeZone: "Europe/Berlin" },
      outOfOfficeProperties: {
        autoDeclineMode: "declineAllConflictingInvitations",
        declineMessage: "On vacation",
      },
    });
  } finally {
    mock.restore();
  }
});

test("createOutOfOffice omits the properties object when nothing is configured", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleCalendarClient(staticConfig()).createOutOfOffice({
      calendarId: "primary",
      startDateTime: "2026-09-01T00:00:00Z",
      endDateTime: "2026-09-02T00:00:00Z",
    });
    const body = JSON.parse(mock.calls[0].body!) as Record<string, unknown>;
    assert.equal(body.outOfOfficeProperties, undefined);
    assert.equal(body.eventType, "outOfOffice");
  } finally {
    mock.restore();
  }
});

test("createFocusTime maps chat status and the 'new invitations' decline mode", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleCalendarClient(staticConfig()).createFocusTime({
      calendarId: "primary",
      summary: "Deep work",
      startDateTime: "2026-09-01T09:00:00Z",
      endDateTime: "2026-09-01T12:00:00Z",
      autoDecline: "new",
      chatStatus: "do_not_disturb",
    });
    assert.deepEqual(JSON.parse(mock.calls[0].body!), {
      eventType: "focusTime",
      summary: "Deep work",
      start: { dateTime: "2026-09-01T09:00:00Z" },
      end: { dateTime: "2026-09-01T12:00:00Z" },
      focusTimeProperties: {
        autoDeclineMode: "declineOnlyNewConflictingInvitations",
        chatStatus: "doNotDisturb",
      },
    });
  } finally {
    mock.restore();
  }
});

// ---- buildEventTimes / buildEventBody ----

test("buildEventTimes allows an absent pair only when times are optional", () => {
  assert.deepEqual(buildEventTimes({}, false), {});
  assert.throws(() => buildEventTimes({}, true), /Event times are required/);
  assert.deepEqual(buildEventTimes({ startDate: "2026-09-05", endDate: "2026-09-06" }, true), {
    start: { date: "2026-09-05" },
    end: { date: "2026-09-06" },
  });
});

test("buildEventBody keeps unset fields out of the wire body", () => {
  const body = buildEventBody({ summary: "T" }, false);
  assert.deepEqual(body, { summary: "T" });
});

// ---- Retry / timeout / SSRF behavior ----

test("request() retries a 429 for reads and writes alike", async () => {
  for (const run of [
    () => new GoogleCalendarClient(staticConfig({ maxRetries: 3 })).getCalendar("primary"),
    () => new GoogleCalendarClient(staticConfig({ maxRetries: 3 })).deleteEvent("primary", "evt_1"),
  ]) {
    let n = 0;
    const mock = mockFetch(() => {
      n++;
      if (n === 1) return new Response("slow down", { status: 429 });
      return okJson({ ok: true });
    });
    try {
      await run();
      assert.equal(n, 2);
    } finally {
      mock.restore();
    }
  }
});

test("request() retries a 5xx only for GET — a write is never replayed", async () => {
  let n = 0;
  const mock = mockFetch(() => {
    n++;
    if (n === 1) return new Response("unavailable", { status: 503 });
    return okJson({ ok: true });
  });
  try {
    const result = await new GoogleCalendarClient(staticConfig({ maxRetries: 3 })).getCalendar("primary");
    assert.deepEqual(result, { ok: true });
    assert.equal(n, 2, "the read is retried");
  } finally {
    mock.restore();
  }

  n = 0;
  const mock2 = mockFetch(() => {
    n++;
    return new Response("unavailable", { status: 503 });
  });
  try {
    await assert.rejects(
      () =>
        new GoogleCalendarClient(staticConfig({ maxRetries: 3 })).createEvent({
          calendarId: "primary",
          summary: "X",
          startDateTime: "2026-09-01T10:00:00Z",
          endDateTime: "2026-09-01T11:00:00Z",
        }),
      /HTTP 503/,
    );
    assert.equal(n, 1, "a 503 on a write must not be replayed — the event may already exist");
  } finally {
    mock2.restore();
  }
});

test("request() retries a network error only for GET", async () => {
  let n = 0;
  const mock = mockFetch(() => {
    n++;
    if (n === 1) throw new Error("ECONNRESET");
    return okJson({ ok: true });
  });
  try {
    const result = await new GoogleCalendarClient(staticConfig({ maxRetries: 2 })).getCalendar("primary");
    assert.deepEqual(result, { ok: true });
    assert.equal(n, 2);
  } finally {
    mock.restore();
  }

  n = 0;
  const mock2 = mockFetch(() => {
    n++;
    throw new Error("ECONNRESET");
  });
  try {
    await assert.rejects(
      () => new GoogleCalendarClient(staticConfig({ maxRetries: 2 })).deleteEvent("primary", "evt_1"),
      /ECONNRESET/,
    );
    assert.equal(n, 1, "a network error on a write must not be replayed");
  } finally {
    mock2.restore();
  }
});

test("request() does not retry a 400 and gives up after maxRetries on 429", async () => {
  let n = 0;
  const mock = mockFetch(() => {
    n++;
    return new Response('{"error":{"message":"bad","status":"INVALID_ARGUMENT"}}', { status: 400 });
  });
  try {
    await assert.rejects(
      () => new GoogleCalendarClient(staticConfig({ maxRetries: 3 })).getCalendar("primary"),
      /HTTP 400: \[INVALID_ARGUMENT\] bad/,
    );
    assert.equal(n, 1);
  } finally {
    mock.restore();
  }

  n = 0;
  const mock2 = mockFetch(() => {
    n++;
    return new Response("slow down", { status: 429 });
  });
  try {
    await assert.rejects(
      () => new GoogleCalendarClient(staticConfig({ maxRetries: 2 })).getCalendar("primary"),
      /HTTP 429/,
    );
    assert.equal(n, 3); // initial + 2 retries
  } finally {
    mock2.restore();
  }
});

test("request() aborts and reports a timeout when the request hangs", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = ((_url: unknown, init: unknown) =>
    new Promise((_resolve, reject) => {
      const signal = (init as RequestInit).signal as AbortSignal;
      signal.addEventListener("abort", () =>
        reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
      );
    })) as typeof fetch;
  try {
    const client = new GoogleCalendarClient(staticConfig({ timeoutMs: 10, maxRetries: 0 }));
    await client.getCalendar("primary").then(
      () => assert.fail("must reject"),
      (err) => assert.match(String(err), /timed out after 10ms/),
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("request() rejects an absolute path (SSRF) and never fetches a foreign origin", async () => {
  for (const evil of ["https://evil.example/steal", "http://evil.example/x", "\\\\evil.example/x"]) {
    const mock = mockFetch(() => okJson({}));
    try {
      await assert.rejects(
        () => new GoogleCalendarClient(staticConfig()).request("GET", evil),
        /foreign origin/,
      );
      assert.equal(mock.calls.length, 0, `must not fetch for ${JSON.stringify(evil)}`);
    } finally {
      mock.restore();
    }
  }
});

// www.googleapis.com hosts every Google API, so the origin guard alone would
// let a broadly-scoped token reach Drive or Gmail through raw_request. The
// pin is checked on the RESOLVED pathname, so ../ traversal cannot dodge it.
test("request() rejects a same-origin path outside calendar/v3/ and never fetches", async () => {
  for (const foreign of [
    "drive/v3/files",
    "gmail/v1/users/me/messages",
    "calendar/v3/../../drive/v3/files",
    "calendar/v3x/evil",
    "oauth2/v1/tokeninfo",
  ]) {
    const mock = mockFetch(defaultHandler);
    try {
      await assert.rejects(
        () => new GoogleCalendarClient(staticConfig()).request("GET", foreign),
        /must stay under "calendar\/v3\/"/,
      );
      assert.equal(mock.calls.length, 0, `must not fetch for ${JSON.stringify(foreign)}`);
    } finally {
      mock.restore();
    }
  }
});

test("request() still accepts a relative API path with a query string", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    const result = await new GoogleCalendarClient(staticConfig()).request(
      "GET",
      "calendar/v3/calendars/primary/events?maxResults=10",
    );
    assert.deepEqual(result, { ok: true });
    assert.equal(mock.calls[0].url, `${BASE}/calendar/v3/calendars/primary/events?maxResults=10`);
  } finally {
    mock.restore();
  }
});
