# Google Calendar: List events — MCP tool

**Google Calendar MCP tool:** Lists events on a calendar within a time window, with search, sorting and recurring-event expansion.

Technical name: `list_events`

## What task it solves

> I want to see what is on a calendar for a given period.

Returns the events on one calendar: id, summary, start/end, status, attendees with their response status, organizer, recurrence, Meet link and event type.

## When to use it

Use it for "what's on my calendar" questions — with `single_events: true` so recurring events appear as concrete occurrences (also required for `order_by: start_time`). Use `q` to search by text, and `updated_min` + `show_deleted` for incremental polling of changes.

## What to provide

- `calendar_id` — **required**. From `list_calendars`, or `"primary"`.
- `time_min` / `time_max` — **optional**. RFC3339 window bounds (events overlapping the window are included).
- `q` — **optional**. Free-text search over summary, description, location and attendees.
- `single_events` — **optional**. Expand recurring events into instances.
- `order_by` — **optional**. `start_time` (needs `single_events: true`) or `updated`.
- `time_zone` — **optional**. IANA zone the response times are rendered in.
- `max_results`, `page_token` — **optional**. Pagination (1..2500 per page).
- `show_deleted`, `updated_min` — **optional**. Incremental polling of changes.
- `event_types` — **optional**. Filter, e.g. `["out_of_office"]`.

## What it returns

Compact JSON with `items[]` and `nextPageToken` when more pages exist. All-day events carry `date` with an EXCLUSIVE end date; timed events carry `dateTime`.

## What changes in Google Calendar

The tool reads Google Calendar data and does not change it.

## Example request

> What meetings do I have next week, in my local time zone?

## Errors and limitations

`time_zone` only changes how times are rendered, never the events themselves. Without `single_events`, a recurring series appears once as its master. A too-old `updated_min` returns HTTP 410 — restart with a plain window. Cancelled events come back only with `show_deleted: true`.

Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Get an event](./get-event.md) — `get_event`
- [List instances of a recurring event](./list-event-instances.md) — `list_event_instances`
- [Create an event](./create-event.md) — `create_event`
- [Query free/busy times](./query-free-busy.md) — `query_free_busy`

## Technical details

- **Impact:** read-only
- **Group:** Events
- **Description source:** `list_events` registration in `src/tools/events.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
