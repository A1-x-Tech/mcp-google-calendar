# Google Calendar: Create an event — MCP tool

**Google Calendar MCP tool:** Creates a timed, all-day or recurring event, optionally with guests, reminders and a Google Meet link.

Technical name: `create_event`

## What task it solves

> I want to put a new event on a calendar.

Creates an event and returns it (id, htmlLink, start/end, attendees, hangoutLink when a Meet was requested).

## When to use it

Use it to schedule meetings, all-day entries or recurring series. For a common free slot with other people, run `query_free_busy` first — this tool does not check for conflicts. For Out of Office or Focus Time use their dedicated tools.

## What to provide

- `calendar_id` — **required**. From `list_calendars`, or `"primary"`.
- `summary` — **required**. Event title.
- Times — **required**, one pair: `start_date_time` + `end_date_time` (RFC3339; add `time_zone` for recurring events) OR `start_date` + `end_date` for all-day (`end_date` is EXCLUSIVE — the day after the last day).
- `attendees` — **optional**. Guest emails; invitation emails go out only with `send_updates: all`.
- `recurrence` — **optional**. RRULE lines, e.g. `["RRULE:FREQ=WEEKLY;BYDAY=MO"]`.
- `add_meet` — **optional**. Attach a Google Meet link.
- `send_updates` — **optional**. `all` / `external_only` / `none` (default: nobody is emailed).
- `reminders`, `use_default_reminders`, `transparency`, `visibility`, `color_id`, `guests_can_*` — **optional**.

## What it returns

The created event as compact JSON, including its `id` for later updates.

## What changes in Google Calendar

A new event appears on the target calendar. With `send_updates: all`, every guest receives an invitation email. Nothing else is touched.

## Example request

> Schedule a 30-minute sync with anna@example.com tomorrow at 10:00 Berlin time, with a Meet link, and send her the invitation.

## Errors and limitations

The write is never retried after a timeout or 5xx — re-sending blindly would duplicate the event and could re-email every guest; check with `list_events` first. A Meet link may come back `status: pending` — re-run `get_event` for the final URL. Needs `writer`/`owner` access to the calendar.

Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Query free/busy times](./query-free-busy.md) — `query_free_busy`
- [Update an event](./update-event.md) — `update_event`
- [Delete an event](./delete-event.md) — `delete_event`
- [Create an Out of Office block](./create-out-of-office.md) — `create_out_of_office`

## Technical details

- **Impact:** changes data
- **Group:** Events
- **Description source:** `create_event` registration in `src/tools/events.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
