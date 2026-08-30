# Google Calendar: Raw API call — MCP tool

**Google Calendar MCP tool:** Escape hatch to call any Google Calendar API v3 path directly when the typed tools don't cover the request.

Technical name: `raw_request`

## What task it solves

> I want to reach a Calendar API capability that has no dedicated tool.

Sends one authenticated request to any Calendar API v3 path and returns the response.

## When to use it

Use it for the corners the typed tools skip: `events.quickAdd`, the colors palette (`calendar/v3/colors`), ACL rules, secondary-calendar creation, removing a Meet conference (PATCH with `{"conferenceData": null}` and `?conferenceDataVersion=1`), watch channels, or a full-event PUT.

## What to provide

- `path` — **required**. Relative to `https://www.googleapis.com` and starting with `calendar/v3/`, e.g. `calendar/v3/calendars/primary/events`; may carry a query string.
- `method` — **optional**. GET / POST / PUT / PATCH / DELETE (default GET).
- `body` — **optional**. JSON body for POST/PUT/PATCH.

## What it returns

The raw API response as compact JSON.

## What changes in Google Calendar

Whatever the chosen endpoint does — this tool can create, overwrite and delete real calendar data. It is annotated destructive because the worst case, not the average, decides.

## Example request

> Use the raw API to quick-add "Lunch with Sam tomorrow at noon" to my primary calendar.

## Errors and limitations

A path resolving to a foreign origin is rejected before any request is sent (SSRF guard), so the Bearer token never leaves `www.googleapis.com`. A path resolving outside `calendar/v3/` is rejected the same way — `www.googleapis.com` hosts other Google APIs (Drive, Gmail, …), and this server exposes only the Calendar API, even with a broadly-scoped token. PUT replaces unspecified fields with defaults — prefer `update_event` (PATCH) when it can express the change. Writes are never retried after an ambiguous failure.

Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Create an event](./create-event.md) — `create_event`
- [Update an event](./update-event.md) — `update_event`
- [Get a calendar](./get-calendar.md) — `get_calendar`

## Technical details

- **Impact:** destructive operation
- **Group:** Additional API methods
- **Description source:** `raw_request` registration in `src/tools/raw.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
