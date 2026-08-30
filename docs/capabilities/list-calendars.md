# Google Calendar: List calendars — MCP tool

**Google Calendar MCP tool:** Lists the calendars on the user's calendar list — the ids every other tool needs, with time zones and access roles.

Technical name: `list_calendars`

## What task it solves

> I want to see which calendars I have and which of them I can write to.

Returns the user's calendar list: id (the `calendar_id` for every other tool), summary, description, timeZone (IANA), accessRole (`owner` / `writer` / `reader` / `freeBusyReader`), `primary: true` on the main calendar, and hidden/selected flags.

## When to use it

Use it at the start of a session to discover calendar ids, or with `min_access_role: writer` to find the calendars where events can be created. Skip it when the primary calendar is enough — the special id `primary` always works without listing.

## What to provide

- `max_results` — **optional**. Calendars per page (1..250).
- `page_token` — **optional**. `nextPageToken` from the previous page.
- `min_access_role` — **optional**. Only calendars with at least this role: `free_busy_reader`, `reader`, `writer`, `owner`.
- `show_hidden` — **optional**. Include calendars the user has hidden.

## What it returns

Compact JSON with `items[]` (one entry per calendar) and `nextPageToken` when more pages exist.

## What changes in Google Calendar

The tool reads Google Calendar data and does not change it.

## Example request

> List my calendars and tell me which ones I can add events to.

## Errors and limitations

Calendars shared with the user but never added to their calendar list do not appear here — they must be addressed by their explicit id. Writes need `writer` or `owner` on the target calendar.

Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Get a calendar](./get-calendar.md) — `get_calendar`
- [List events](./list-events.md) — `list_events`
- [Query free/busy times](./query-free-busy.md) — `query_free_busy`

## Technical details

- **Impact:** read-only
- **Group:** Calendars
- **Description source:** `list_calendars` registration in `src/tools/calendars.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
