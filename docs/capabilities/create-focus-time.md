# Google Calendar: Create a Focus Time block — MCP tool

**Google Calendar MCP tool:** Creates a Focus Time event that protects a slot, can auto-decline invitations and silence Google Chat.

Technical name: `create_focus_time`

## What task it solves

> I want to protect time for deep work on my calendar.

Creates a Focus Time event on the primary calendar and returns it.

## When to use it

Use it to block working sessions: the slot shows as busy, `auto_decline` can reject conflicting invitations (with an optional `decline_message`), and `chat_status: do_not_disturb` flips Google Chat to Do Not Disturb for the duration.

## What to provide

- `start_date_time`, `end_date_time` — **required**. RFC3339 (these blocks are always timed, never all-day).
- `calendar_id` — **optional**, defaults to `"primary"` (the only place the API accepts it).
- `summary` — **optional**, defaults to "Focus time".
- `time_zone`, `auto_decline`, `decline_message`, `chat_status`, `send_updates` — **optional**.

## What it returns

The created event (with `eventType: focusTime`) as compact JSON.

## What changes in Google Calendar

A new Focus Time block appears on the primary calendar. Depending on the options, Calendar starts declining conflicting invitations and Google Chat switches to Do Not Disturb during the block.

## Example request

> Block 9:00–12:00 tomorrow for deep work, decline new meeting invitations and set my chat to do not disturb.

## Errors and limitations

ONLY works on the PRIMARY calendar of a Google Workspace account — consumer Gmail and secondary calendars get HTTP 400. Manage the block afterwards like any event: `update_event` / `delete_event`, and `list_events` with `event_types: ["focus_time"]` to find existing blocks. Not retried after an ambiguous failure — check `list_events` before re-sending.

Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Create an Out of Office block](./create-out-of-office.md) — `create_out_of_office`
- [List events](./list-events.md) — `list_events`
- [Update an event](./update-event.md) — `update_event`

## Technical details

- **Impact:** changes data
- **Group:** Availability
- **Description source:** `create_focus_time` registration in `src/tools/availability.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
