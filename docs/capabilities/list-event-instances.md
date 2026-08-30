# Google Calendar: List instances of a recurring event — MCP tool

**Google Calendar MCP tool:** Expands one recurring series into individual occurrences, each with its own id for targeted edits.

Technical name: `list_event_instances`

## What task it solves

> I want to work with single occurrences of a repeating event.

Expands a recurring event (the series master) into its instances, each with its own id (like `masterId_20260901T100000Z`) and concrete start/end.

## When to use it

Use it before changing or cancelling ONE occurrence: take the instance id from here and pass it to `update_event` or `delete_event`. Exceptions already made to the series show their changed times here. For a general "what's coming up" view, `list_events` with `single_events: true` is usually simpler.

## What to provide

- `calendar_id` — **required**. From `list_calendars`, or `"primary"`.
- `event_id` — **required**. The recurring series master id.
- `time_min` / `time_max` — **optional**. RFC3339 window bounds — recommended, an infinite series otherwise pages forever.
- `time_zone`, `max_results`, `page_token`, `show_deleted` — **optional**.

## What it returns

Compact JSON with `items[]` (one entry per occurrence) and `nextPageToken` when more pages exist.

## What changes in Google Calendar

The tool reads Google Calendar data and does not change it.

## Example request

> Show the next five occurrences of my weekly team standup so I can cancel the one that falls on the holiday.

## Errors and limitations

The event must be a recurring master; a non-recurring id yields no instances. Cancelled occurrences appear only with `show_deleted: true` (as `status: cancelled`).

Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [List events](./list-events.md) — `list_events`
- [Update an event](./update-event.md) — `update_event`
- [Delete an event](./delete-event.md) — `delete_event`

## Technical details

- **Impact:** read-only
- **Group:** Events
- **Description source:** `list_event_instances` registration in `src/tools/events.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
