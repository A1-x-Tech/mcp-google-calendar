import { ConfigError, CredentialsError, loadConfig } from "./config.js";
import { GoogleCalendarClient } from "./client.js";

/**
 * Live smoke check against the real Google Calendar API.
 *
 * Default mode is READ-ONLY: with a calendar id (argv or
 * GOOGLE_CALENDAR_SMOKE_CALENDAR_ID) it fetches that calendar-list entry and
 * lists a page of upcoming events; without one it just mints an access token
 * from the refresh token. Nothing is written.
 *
 * Opt-in write mode (GOOGLE_CALENDAR_SMOKE_WRITE=1) exercises the full
 * create → read → delete cycle on a DISPOSABLE event: a uniquely-named,
 * attendee-free, 15-minute event in the far future on the smoke calendar
 * (default "primary"). Cleanup runs in `finally`, after success AND after a
 * mid-cycle error, so the event never outlives the run; a cleanup failure is
 * reported with the event id so it can be removed by hand.
 */
async function main(): Promise<void> {
  const client = new GoogleCalendarClient(loadConfig());
  const calendarId = process.argv[2] ?? process.env.GOOGLE_CALENDAR_SMOKE_CALENDAR_ID;
  const writeMode = process.env.GOOGLE_CALENDAR_SMOKE_WRITE === "1";

  if (writeMode) {
    await writeSmoke(client, calendarId ?? "primary");
    return;
  }

  if (calendarId) {
    const calendar = (await client.getCalendar(calendarId)) as { summary?: string; timeZone?: string };
    const events = (await client.listEvents({
      calendarId,
      timeMin: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
      singleEvents: true,
      orderBy: "start_time",
      maxResults: 5,
    })) as { items?: unknown[] };
    console.log(
      JSON.stringify(
        {
          calendarId,
          summary: calendar.summary,
          timeZone: calendar.timeZone,
          upcomingEvents: events.items?.length ?? 0,
        },
        null,
        2,
      ),
    );
    return;
  }
  console.log(JSON.stringify(await client.authCheck(), null, 2));
}

/** create → get → delete on a disposable event; the delete runs even when get fails. */
async function writeSmoke(client: GoogleCalendarClient, calendarId: string): Promise<void> {
  // Far future + unique name: never collides with real events, obviously junk
  // if cleanup ever fails.
  const start = new Date(Date.now() + 365 * 24 * 3600 * 1000);
  const end = new Date(start.getTime() + 15 * 60 * 1000);
  const summary = `mcp-google-calendar smoke ${start.toISOString()}`;

  const created = (await client.createEvent({
    calendarId,
    summary,
    description: "Disposable smoke-test event created by mcp-google-calendar; safe to delete.",
    startDateTime: toRfc3339(start),
    endDateTime: toRfc3339(end),
    timeZone: "UTC",
  })) as { id?: string };
  if (typeof created.id !== "string" || !created.id) {
    throw new Error("write smoke: create_event returned no event id");
  }
  console.log(JSON.stringify({ step: "created", calendarId, eventId: created.id, summary }));

  try {
    const fetched = (await client.getEvent(calendarId, created.id)) as { summary?: string };
    if (fetched.summary !== summary) {
      throw new Error(`write smoke: fetched summary mismatch (${String(fetched.summary)})`);
    }
    console.log(JSON.stringify({ step: "verified", eventId: created.id }));
  } finally {
    // Cleanup after success and failure alike — the disposable event must not
    // survive the run. A failed delete surfaces the id for manual removal.
    try {
      await client.deleteEvent(calendarId, created.id);
      console.log(JSON.stringify({ step: "cleaned", eventId: created.id }));
    } catch (err) {
      console.error(
        `write smoke: CLEANUP FAILED — delete event ${created.id} on ${calendarId} by hand:`,
        err instanceof Error ? err.message : err,
      );
      process.exitCode = 1;
    }
  }
}

/** RFC3339 without fractional seconds (the shape the API examples use). */
function toRfc3339(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

main().catch((err) => {
  // Missing or malformed credentials are a user error, not a bug: no stack.
  const userError = err instanceof ConfigError || err instanceof CredentialsError;
  console.error("smoke failed:", userError ? err.message : err);
  process.exit(1);
});
