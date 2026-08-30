# Google Calendar: Get a calendar — MCP tool

**Google Calendar MCP tool:** Fetches one calendar-list entry — summary, time zone, access role and default reminders.

Technical name: `get_calendar`

## What task it solves

> I want to check one calendar's time zone and my access to it.

Returns the calendar-list entry: summary, description, timeZone (the calendar's default IANA zone — the key to interpreting event times), accessRole, defaultReminders and `primary`.

## When to use it

Use it before scheduling on an unfamiliar calendar: the time zone decides how times without an explicit zone are read, and the access role decides whether writes will succeed.

## What to provide

- `calendar_id` — **required**. From `list_calendars`, or `"primary"` for the main calendar.

## What it returns

One calendar-list entry as compact JSON.

## What changes in Google Calendar

The tool reads Google Calendar data and does not change it.

## Example request

> What time zone is my team calendar in, and can I create events on it?

## Errors and limitations

Works only for calendars on the user's calendar list; a shared calendar never added to the list returns 404 here — use `raw_request` with path `calendar/v3/calendars/<id>` instead.

Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [List calendars](./list-calendars.md) — `list_calendars`
- [List events](./list-events.md) — `list_events`
- [Raw Google Calendar API call](./raw-request.md) — `raw_request`

## Technical details

- **Impact:** read-only
- **Group:** Calendars
- **Description source:** `get_calendar` registration in `src/tools/calendars.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
