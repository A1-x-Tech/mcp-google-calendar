# Google Calendar: Update an event — MCP tool

**Google Calendar MCP tool:** Partially updates an event — reschedule, retitle, change guests, reminders or a single recurring occurrence.

Technical name: `update_event`

## What task it solves

> I want to change an existing event.

Applies a partial update (PATCH): only the provided fields change. Returns the updated event.

## When to use it

Use it to reschedule (send BOTH the new start and end), rename, edit the description or guest list, add a Meet link, or change reminders. To touch one occurrence of a recurring series, pass that instance's id from `list_event_instances`; the master id changes every occurrence. Moving an event to a different calendar is `move_event`, not this.

## What to provide

- `calendar_id`, `event_id` — **required**.
- Any of the `create_event` fields — **optional**, at least one: `summary`, `description`, `location`, times, `attendees`, `recurrence`, `add_meet`, `reminders`, `transparency`, `visibility`, `color_id`, guest permissions.
- `send_updates` — **optional**. Guests hear about the change only with `all`.

## What it returns

The updated event as compact JSON.

## What changes in Google Calendar

The named fields of the live event are overwritten. A provided nested object replaces its predecessor wholesale: `attendees` replaces the ENTIRE guest list (fetch the event first and send the complete new list), `reminders` replaces all overrides.

## Example request

> Move tomorrow's design review to 15:00–16:00 and add pete@example.com to the guest list, notifying everyone.

## Errors and limitations

A time change should carry both `start_date_time` and `end_date_time` (or both dates) — patching only one side can be rejected or produce a zero-length event. Not retried after an ambiguous failure — verify with `get_event` before re-sending. Needs `writer`/`owner` access (or `guests_can_modify` on the event).

Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Get an event](./get-event.md) — `get_event`
- [List instances of a recurring event](./list-event-instances.md) — `list_event_instances`
- [Move an event to another calendar](./move-event.md) — `move_event`
- [Delete an event](./delete-event.md) — `delete_event`

## Technical details

- **Impact:** destructive operation
- **Group:** Events
- **Description source:** `update_event` registration in `src/tools/events.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
