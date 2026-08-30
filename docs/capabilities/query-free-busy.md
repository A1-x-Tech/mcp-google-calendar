# Google Calendar: Query free/busy times — MCP tool

**Google Calendar MCP tool:** Returns the busy intervals of up to 50 calendars in one window — the way to find a common free slot.

Technical name: `query_free_busy`

## What task it solves

> I want to find a time when everyone is free.

Returns each calendar's busy intervals in the window; the gaps between them are free.

## When to use it

Use it before `create_event` when scheduling with other people, or to answer "when is X available". Attendee email addresses double as their primary-calendar ids, subject to their sharing settings.

## What to provide

- `time_min`, `time_max` — **required**. RFC3339 window bounds.
- `calendar_ids` — **required**. 1..50 ids: `"primary"`, ids from `list_calendars`, or attendee emails.
- `time_zone` — **optional**. IANA zone the busy times are rendered in (default UTC).

## What it returns

Compact JSON mapping each calendar id to `busy: [{start, end}]` ranges; calendars the user cannot read appear under `errors`.

## What changes in Google Calendar

The tool reads Google Calendar data and does not change it (a pure read despite being an HTTP POST on the wire).

## Example request

> Find a free hour for me and anna@example.com next Tuesday afternoon, then book it.

## Errors and limitations

Only busy blocks come back — never event titles or details. Events marked `transparent` (shows as free) do not appear. A calendar with no visibility to the user yields an error entry, not an empty busy list — treat that as "unknown", not "free".

Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Create an event](./create-event.md) — `create_event`
- [List events](./list-events.md) — `list_events`
- [List calendars](./list-calendars.md) — `list_calendars`

## Technical details

- **Impact:** read-only
- **Group:** Availability
- **Description source:** `query_free_busy` registration in `src/tools/availability.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
