# Google Calendar MCP capabilities

This catalog contains 13 public pages—one for every registered MCP tool in `mcp-google-calendar`. Each page starts with the user's task, explains the result, and states whether the call changes real data.

Use this catalog to choose a ready-made capability. Full parameter schemas and API response details remain in the [technical reference](../TOOLS.md).

## Calendars

- [List calendars](./list-calendars.md) — Lists the calendars on the user's calendar list with their ids, time zones and access roles. **Impact:** read-only.
- [Get a calendar](./get-calendar.md) — Fetches one calendar-list entry: summary, time zone, access role, default reminders. **Impact:** read-only.

## Events

- [List events](./list-events.md) — Lists events on a calendar with time-window, search and recurrence-expansion options. **Impact:** read-only.
- [Get an event](./get-event.md) — Fetches one event with attendees, recurrence, Meet link and reminders. **Impact:** read-only.
- [Create an event](./create-event.md) — Creates a timed, all-day or recurring event, optionally with guests and a Google Meet link. **Impact:** changes data.
- [Update an event](./update-event.md) — Partially updates an event: reschedule, retitle, change guests or reminders. **Impact:** destructive operation.
- [Delete an event](./delete-event.md) — Deletes (cancels) an event or a whole recurring series. **Impact:** destructive operation.
- [Move an event to another calendar](./move-event.md) — Moves an event to a different calendar without changing its time. **Impact:** destructive operation.
- [List instances of a recurring event](./list-event-instances.md) — Expands a recurring series into individual occurrences with their own ids. **Impact:** read-only.

## Availability

- [Query free/busy times](./query-free-busy.md) — Returns the busy intervals of up to 50 calendars to find a common free slot. **Impact:** read-only.
- [Create an Out of Office block](./create-out-of-office.md) — Creates an Out of Office event that can auto-decline meeting invitations. **Impact:** changes data.
- [Create a Focus Time block](./create-focus-time.md) — Creates a Focus Time event that protects a slot and can silence Google Chat. **Impact:** changes data.

## Additional API methods

- [Raw Google Calendar API call](./raw-request.md) — Escape hatch to call any Google Calendar API v3 path the typed tools don't cover. **Impact:** destructive operation.

## For maintainers and publishers

- [MCP capability documentation contract](../CAPABILITY-DOCUMENTATION.md)
- [Technical tool reference](../TOOLS.md)
- [GitHub repository](https://github.com/A1-x-Tech/mcp-google-calendar)
