# Google Calendar: Delete an event — MCP tool

**Google Calendar MCP tool:** Deletes (cancels) an event, a single occurrence, or an entire recurring series — permanently.

Technical name: `delete_event`

## What task it solves

> I want to cancel an event or a meeting series.

Deletes the event and returns `{deleted: true}`.

## When to use it

Use it to cancel a meeting or remove a calendar entry. To cancel only ONE occurrence of a recurring series, pass that instance's id from `list_event_instances`; passing the series master id cancels the ENTIRE series.

## What to provide

- `calendar_id`, `event_id` — **required**.
- `send_updates` — **optional**. Cancellation emails reach the guests only with `all`.

## What it returns

`{deleted: true, calendarId, eventId}` as a receipt (the API itself returns an empty body).

## What changes in Google Calendar

The event disappears from the calendar (status becomes `cancelled`). On a meeting with guests this cancels it for everyone — but silently unless `send_updates: all`.

## Example request

> Cancel Friday's 1:1 — just that one occurrence, not the whole series — and let the other person know.

## Errors and limitations

There is no undelete. Confirm the target with `get_event` first, especially before deleting anything that might be a series master. Not retried after an ambiguous failure; a second delete of the same id returns 404/410, which simply means it is already gone.

Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Get an event](./get-event.md) — `get_event`
- [List instances of a recurring event](./list-event-instances.md) — `list_event_instances`
- [Update an event](./update-event.md) — `update_event`

## Technical details

- **Impact:** destructive operation
- **Group:** Events
- **Description source:** `delete_event` registration in `src/tools/events.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
