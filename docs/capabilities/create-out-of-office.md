# Google Calendar: Create an Out of Office block — MCP tool

**Google Calendar MCP tool:** Creates an Out of Office event that can auto-decline meeting invitations while it lasts.

Technical name: `create_out_of_office`

## What task it solves

> I want to mark myself away and have meetings declined for me.

Creates an Out of Office event on the primary calendar and returns it.

## When to use it

Use it for vacations, sick days and travel. `auto_decline: all` declines every overlapping meeting; `auto_decline: new` declines only invitations arriving after the block is created (existing meetings survive); `decline_message` customizes the reply.

## What to provide

- `start_date_time`, `end_date_time` — **required**. RFC3339 (these blocks are always timed, never all-day).
- `calendar_id` — **optional**, defaults to `"primary"` (the only place the API accepts it).
- `summary` — **optional**, defaults to "Out of office".
- `time_zone`, `auto_decline`, `decline_message`, `send_updates` — **optional**.

## What it returns

The created event (with `eventType: outOfOffice`) as compact JSON.

## What changes in Google Calendar

A new Out of Office block appears on the primary calendar. Depending on `auto_decline`, Google Calendar starts declining conflicting meeting invitations on the user's behalf.

## Example request

> Mark me out of office next Monday through Friday and auto-decline any new meeting invitations with "I'm on vacation, back Monday".

## Errors and limitations

ONLY works on the PRIMARY calendar of a Google Workspace account — consumer Gmail and secondary calendars get HTTP 400. Manage the block afterwards like any event: `update_event` to change it, `delete_event` to remove it, `list_events` with `event_types: ["out_of_office"]` to find existing blocks. Not retried after an ambiguous failure — check `list_events` before re-sending.

Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Create a Focus Time block](./create-focus-time.md) — `create_focus_time`
- [List events](./list-events.md) — `list_events`
- [Delete an event](./delete-event.md) — `delete_event`

## Technical details

- **Impact:** changes data
- **Group:** Availability
- **Description source:** `create_out_of_office` registration in `src/tools/availability.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
