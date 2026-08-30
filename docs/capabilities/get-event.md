# Google Calendar: Get an event — MCP tool

**Google Calendar MCP tool:** Fetches one event in full — attendees and their answers, recurrence, Google Meet link, reminders.

Technical name: `get_event`

## What task it solves

> I want to see one event's full details.

Returns one event: summary, description, location, start/end, attendees with responseStatus (`accepted` / `declined` / `tentative` / `needsAction`), organizer, recurrence rules, `recurringEventId` (on instances), conferenceData / hangoutLink, reminders, visibility, transparency and eventType.

## When to use it

Use it before editing an event (to see the current guest list and times), to check who accepted, or to fetch the final Meet link after a `create_event` with `add_meet` returned a pending conference.

## What to provide

- `calendar_id` — **required**. From `list_calendars`, or `"primary"`.
- `event_id` — **required**. From `list_events` or `create_event`; an instance id addresses one occurrence.
- `time_zone` — **optional**. IANA zone the response times are rendered in.

## What it returns

One event as compact JSON.

## What changes in Google Calendar

The tool reads Google Calendar data and does not change it.

## Example request

> Show the details of tomorrow's design review — who has accepted, and what's the Meet link?

## Errors and limitations

Works for a series master and for an individual instance id alike. Events on calendars the user cannot read return 404.

Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [List events](./list-events.md) — `list_events`
- [Update an event](./update-event.md) — `update_event`
- [Delete an event](./delete-event.md) — `delete_event`

## Technical details

- **Impact:** read-only
- **Group:** Events
- **Description source:** `get_event` registration in `src/tools/events.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
