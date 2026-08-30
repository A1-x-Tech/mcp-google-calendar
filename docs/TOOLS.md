# Tools

For task-oriented guidance, open the [MCP capability catalog](./capabilities/index.md). This page remains the technical reference for schemas and API responses.

The Google Calendar API mixes reads and writes, so every tool carries explicit
MCP annotations: reads are `readOnlyHint`, updates are idempotent-but-overwriting,
deletes are destructive. Inputs use a normalized snake_case vocabulary; the
client maps them to the API's wire values (`externalOnly`, `startTime`,
`declineAllConflictingInvitations`, `doNotDisturb`, ...) and handles OAuth
entirely on its own.

`calendar_id` is `"primary"` for the user's main calendar, or an id from
`list_calendars`. `event_id` comes from `list_events` / `create_event`; a
recurring-instance id (from `list_event_instances`) addresses one occurrence.

## Connection & login

Six onboarding tools from [@a1-x-tech/mcp-google-auth](https://github.com/A1-x-Tech/mcp-google-auth)
let the user connect from the chat (loopback `127.0.0.1` + PKCE against a
user-owned Desktop OAuth client) instead of minting a refresh token by hand.
Environment credentials always win over the stored login; a login finished
mid-session works immediately, without restarting the AI client.

| Tool | Description |
|---|---|
| `auth_status` | Connection state without network calls: token presence and source (`env`/`stored`), expiry, account email, granted vs missing scopes, credentials path, OAuth-client source. Never returns the token. |
| `setup_instructions` | The one-time checklist: Cloud project, enable the Calendar API, publish the consent screen (Testing-mode refresh tokens die after 7 days), create a Desktop-app client, download its JSON, `set_client`. Shortens when a client is already configured. |
| `set_client` | Saves the OAuth client from the downloaded `client_secret_*.json` by file PATH into the fleet-shared `~/.config/mcp-google-auth/client.json` (0600). The secret never passes through the chat. |
| `start_login` | Returns `authorizeUrl` for the user to open in a browser on this machine; a one-shot listener on `127.0.0.1` catches the redirect and exchanges the code locally. Attempt lives 10 minutes. Deliberately **not** read-only. `GOOGLE_CALENDAR_OAUTH_PORT` pins the port (SSH `-L`). |
| `finish_login` | Saves tokens to `~/.config/mcp-google-calendar/credentials.json` (0600, atomic), verifies via the primary calendarList entry (account email), reports `grantedScopes`/`missingScopes`; an account change revokes the old token and returns `previousAccountEmail`. |
| `logout` | Revokes the stored token at Google and deletes the local credentials file; env tokens are untouched (`envTokenStillSet`). |

## Calendars

| Tool | Description |
|---|---|
| `list_calendars` | The user's calendar list: id, summary, timeZone (IANA), accessRole (`owner`/`writer`/`reader`/`freeBusyReader` — writes need writer+), `primary` flag. Filter with `min_access_role`; paginate via `page_token`. Calendars never added to the list don't appear. |
| `get_calendar` | One calendar-list entry: summary, timeZone, accessRole, defaultReminders, `primary`. For a calendar not on the list use `raw_request` with `calendar/v3/calendars/<id>`. |

## Events

| Tool | Description |
|---|---|
| `list_events` | Events in a window (`time_min`/`time_max`, RFC3339). `single_events: true` expands recurring events into instances — required for `order_by: start_time`. `time_zone` only re-renders response times. `q` searches text; `updated_min` + `show_deleted` enable incremental polling (too-old `updated_min` → HTTP 410); `event_types` filters (e.g. `out_of_office`). ≤2500 per page. |
| `get_event` | One event: attendees + responseStatus, organizer, recurrence, `recurringEventId`, conferenceData/hangoutLink, reminders, transparency, visibility, eventType. Works for masters and instance ids. |
| `create_event` | Creates an event. Times: `start_date_time`+`end_date_time` (RFC3339; `time_zone` required for recurring) OR `start_date`+`end_date` all-day (**end exclusive**). `attendees[]`, `recurrence[]` (RRULE), `add_meet` (sends `conferenceDataVersion=1` + a `createRequest` with a fresh `requestId`), `reminders`/`use_default_reminders`, `transparency`, `visibility`, `color_id`, `guests_can_*`. **`send_updates: all` is the only way guests get emailed.** No conflict checking — `query_free_busy` first. |
| `update_event` | PATCH: only provided fields change, but a nested object replaces its predecessor wholesale — `attendees` replaces the whole guest list, a time change should carry both start and end. Instance id → one occurrence; master id → whole series. |
| `delete_event` | Deletes/cancels. Master id cancels the entire series; instance id one occurrence. No undelete; cancellation emails only with `send_updates: all`. Returns `{deleted:true}` (the API returns an empty 204). |
| `move_event` | `events.move` — re-homes the event to `destination_calendar_id` (same id, new organizer calendar). Only `default`-type events; attendee events only by their organizer; writer access to both calendars. |
| `list_event_instances` | Expands a series master into instances (`masterId_20260901T100000Z`, concrete start/end, exceptions included). Bound with `time_min`/`time_max`; `show_deleted` includes cancelled occurrences. |

## Availability

| Tool | Description |
|---|---|
| `query_free_busy` | `freeBusy.query` (a POST on the wire, a read in effect): busy `[{start,end}]` per calendar id, 1..50 ids per call — ids or attendee emails (their primary calendars, subject to sharing). Only busy blocks, never titles; `transparent` events don't appear; unreadable calendars land in `errors`. |
| `create_out_of_office` | `eventType: outOfOffice` event on the **Workspace primary calendar only** (consumer Gmail / secondary calendars → HTTP 400). Timed only. `auto_decline`: `none`/`all`/`new` → `declineNone`/`declineAllConflictingInvitations`/`declineOnlyNewConflictingInvitations`; `decline_message`. Managed afterwards via `update_event`/`delete_event`. |
| `create_focus_time` | `eventType: focusTime`, same constraints as OOO, plus `chat_status` (`available`/`do_not_disturb` → `doNotDisturb`) to silence Google Chat. |

## Escape hatch

| Tool | Description |
|---|---|
| `raw_request` | Any Calendar API v3 path (`GET`/`POST`/`PUT`/`PATCH`/`DELETE`, default GET) relative to `https://www.googleapis.com` — quickAdd, colors, ACL, secondary-calendar creation, watch channels, conference removal. Foreign-origin paths are rejected (SSRF guard) so the Bearer token never leaves the API host, and paths resolving outside `calendar/v3/` are rejected too — the host serves every Google API, but this server exposes only Calendar. PUT replaces unspecified fields — prefer `update_event` (PATCH). |

## Notes

- **Retry policy:** 429 is retried with backoff for every method (the request was
  rejected before executing); 5xx and network errors are retried **only for GET** —
  replaying a write after an ambiguous failure could duplicate the event and
  re-email every guest.
- **OAuth:** access tokens are minted from the refresh token automatically, cached
  until ~60s before expiry, and re-minted once on a 401.
- **Scopes (minimal):** `https://www.googleapis.com/auth/calendar.events` (event
  reads/writes incl. OOO and Focus Time) + `https://www.googleapis.com/auth/calendar.readonly`
  (calendar list and free/busy). The broad `.../auth/calendar` scope is needed only
  for `raw_request` calls that manage calendars/ACLs themselves.
- **Notifications:** no write emails anybody unless `send_updates` says so — the
  API default is silence.
- **Time zones:** IANA names (`Europe/Berlin`). All-day `end_date` is exclusive.
  A calendar's own zone comes from `get_calendar`.

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GOOGLE_CALENDAR_CLIENT_ID` | yes* | — | OAuth2 client id (refresh flow). |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | yes* | — | OAuth2 client secret (refresh flow). Secret. |
| `GOOGLE_CALENDAR_REFRESH_TOKEN` | yes* | — | OAuth2 refresh token (refresh flow). Secret. |
| `GOOGLE_CALENDAR_ACCESS_TOKEN` | yes* | — | Alternative: static access token (~1 h lifetime). Secret. |
| `GOOGLE_CALENDAR_OAUTH_PORT` | no | random | Fixed port for the `start_login` loopback listener (SSH port forwarding). |
| `GOOGLE_CALENDAR_API_BASE` | no | `https://www.googleapis.com` | API root override. |
| `GOOGLE_CALENDAR_TIMEOUT_MS` | no | `60000` | Per-request timeout, ms. |
| `GOOGLE_CALENDAR_MAX_RETRIES` | no | `3` | Retries on transient errors. |

\* Either the refresh triple together, or the static access token — or neither,
with the in-chat login (`start_login`/`finish_login`) providing the token
instead. Environment credentials always beat the stored login.
