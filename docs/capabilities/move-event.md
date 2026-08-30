# Google Calendar: Move an event to another calendar — MCP tool

**Google Calendar MCP tool:** Moves an event from one calendar to another without changing its time.

Technical name: `move_event`

## What task it solves

> I want to move this event onto a different calendar.

Moves the event to the destination calendar (its organizer calendar changes; the event id stays the same) and returns the moved event.

## When to use it

Use it to re-home an event — e.g. from a personal calendar to a team calendar. Rescheduling to another TIME is `update_event`, not this.

## What to provide

- `calendar_id` — **required**. The calendar the event is on now.
- `event_id` — **required**.
- `destination_calendar_id` — **required**. The target calendar (from `list_calendars`).
- `send_updates` — **optional**. `all` notifies the guests about the move.

## What it returns

The moved event as compact JSON.

## What changes in Google Calendar

The event disappears from the source calendar and appears on the destination calendar. Guests keep their invitations; the organizer calendar changes.

## Example request

> Move the quarterly planning event from my calendar to the team calendar.

## Errors and limitations

Only regular events can move — Out of Office, Focus Time, working-location and birthday events cannot. An event with attendees can be moved only by its organizer. Needs `writer` access to BOTH calendars. Replaying the same move converges (the event is already there), but verify with `get_event` after an ambiguous failure.

Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Update an event](./update-event.md) — `update_event`
- [List calendars](./list-calendars.md) — `list_calendars`
- [Get an event](./get-event.md) — `get_event`

## Technical details

- **Impact:** destructive operation
- **Group:** Events
- **Description source:** `move_event` registration in `src/tools/events.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
