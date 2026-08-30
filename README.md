# <img src="./assets/a1-logo.svg" alt="A1" width="40"> Google Calendar MCP

[![CI](https://github.com/A1-x-Tech/mcp-google-calendar/actions/workflows/ci.yml/badge.svg)](https://github.com/A1-x-Tech/mcp-google-calendar/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

MCP server (stdio) for the **Google Calendar API v3**: list calendars and events
with correct time-zone handling, create/update/move/delete events, manage
attendees and notifications, attach Google Meet, work with recurring events and
individual instances, query free/busy, and create Out of Office / Focus Time
blocks where the API supports them.

> Technical README for the handover stage. A full public README, marketing copy
> and store listings are the next task.

## Tools (13)

| Group | Tools |
|---|---|
| Calendars (read) | `list_calendars`, `get_calendar` |
| Events (read) | `list_events`, `get_event`, `list_event_instances` |
| Events (write) | `create_event`, `update_event`, `delete_event`, `move_event` |
| Availability | `query_free_busy` (read), `create_out_of_office`, `create_focus_time` |
| Escape hatch | `raw_request` |

Every tool carries all four MCP annotation hints; reads and writes are strictly
separated (free/busy is annotated read-only despite being a POST). Details:
[docs/TOOLS.md](./docs/TOOLS.md) and the task-oriented
[capability catalog](./docs/capabilities/index.md).

## Quick start

Requires Node.js 20+ and Google OAuth credentials from a Cloud project with the
Google Calendar API enabled. Minimal scopes:
`https://www.googleapis.com/auth/calendar.events` +
`https://www.googleapis.com/auth/calendar.readonly`.

Add to an MCP client config:

```json
{
  "mcpServers": {
    "google-calendar": {
      "command": "npx",
      "args": ["-y", "@a1-x-tech/mcp-google-calendar@latest"],
      "env": {
        "GOOGLE_CALENDAR_CLIENT_ID": "your_client_id",
        "GOOGLE_CALENDAR_CLIENT_SECRET": "your_client_secret",
        "GOOGLE_CALENDAR_REFRESH_TOKEN": "your_refresh_token"
      }
    }
  }
}
```

Alternative for quick sessions: `GOOGLE_CALENDAR_ACCESS_TOKEN` with a short-lived
token (`gcloud auth print-access-token`). Without credentials the server still
starts and answers the MCP handshake — every tool call then explains exactly
which variables to set (degraded start, by design).

## Behavior guarantees

- **Writes are never blindly retried.** 429 is retried with backoff for every
  method; 5xx/network errors only for GET — a replayed create would duplicate
  the event and can re-email every guest.
- **Nobody is notified by accident.** The API default for invitations, changes
  and cancellations is silence; every mutating tool exposes `send_updates`.
- **Tokens stay put.** Auth lives entirely in the HTTP client; paths resolving
  to a foreign origin — or outside `calendar/v3/` on the shared Google API
  host — are rejected before the Bearer token is attached; no credentials or
  user content are ever logged or sent to telemetry.

## Development

```bash
npm install
npm run typecheck && npm test   # offline suite + dist smoke over a real MCP handshake
npm run smoke                   # live check (read-only; GOOGLE_CALENDAR_SMOKE_WRITE=1 for the disposable write cycle)
```

More: [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md),
[docs/PUBLISHING.md](./docs/PUBLISHING.md), [CLAUDE.md](./CLAUDE.md).

## Telemetry

Anonymous usage pings (event/tool names and versions only — never credentials,
calendar data or arguments). Opt out: `ASKADS_TELEMETRY=0`. Details in
[docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md#usage-telemetry).

## License

[MIT](./LICENSE) © A1 x Tech
