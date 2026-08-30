# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and the project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- In-chat Google login via `@a1-x-tech/mcp-google-auth` — 6 new onboarding
  tools: `auth_status`, `setup_instructions`, `set_client`, `start_login`
  (deliberately not read-only), `finish_login`, `logout`. The flow is loopback
  `127.0.0.1` + PKCE against a user-owned Desktop OAuth client; the code is
  exchanged locally and secrets never pass through the chat. 19 tools total,
  each with a capability page under `docs/capabilities/`.
- `finish_login` verifies a fresh login with a read-only Calendar API call
  (`fetchCalendarIdentity`: the primary calendarList entry, whose `id` is the
  account email) — proving the Calendar API is enabled for the token, not just
  that OIDC answers.
- Tokens from a login are stored per server in
  `~/.config/mcp-google-calendar/credentials.json` (0600, atomic writes) and
  re-read on every call, so a login finished mid-session works without
  restarting the AI client. `GOOGLE_CALENDAR_OAUTH_PORT` pins the loopback
  listener port for SSH port forwarding.

### Changed

- `GoogleCalendarClient` accepts the component's `TokenProvider` as a fallback
  token source: environment credentials (the refresh triple or
  `GOOGLE_CALENDAR_ACCESS_TOKEN`) keep absolute priority and behave exactly as
  before; the stored in-chat login is used only when the environment carries no
  credentials. The 401 re-mint + replay works for provider-backed tokens too.
- The unconfigured `initialize` instructions now lead with the in-chat login
  (`setup_instructions` → `set_client` → `start_login` → `finish_login`, no
  restart needed); setting the environment variables + restart remains the
  documented alternative. A missing-credentials tool call now fails with the
  component's `AuthRequiredError` naming both fixes (previously only the env
  variables).

## [0.1.0] — 2026-08-30

### Added

- Initial release: MCP server for the Google Calendar API v3 over stdio.
- 13 tools: `list_calendars`, `get_calendar`, `list_events`, `get_event`,
  `create_event`, `update_event`, `delete_event`, `move_event`,
  `list_event_instances`, `query_free_busy`, `create_out_of_office`,
  `create_focus_time`, `raw_request` — each with zod input schemas and all four
  MCP annotation hints (READ_ONLY / WRITE / UPDATE / DESTRUCTIVE presets).
- OAuth2 refresh-token flow with token caching, deduped concurrent refreshes and
  a single forced re-mint + replay on 401; static access-token alternative.
- Degraded start: missing credentials never kill the process — the server
  completes the MCP handshake, opens the `initialize` instructions with the fix,
  and the first tool call fails with an actionable `CredentialsError` before any
  network I/O.
- Retry with exponential backoff and `Retry-After` support: 429 for every
  method; 5xx/network errors only for GET — writes are never replayed after an
  ambiguous failure.
- AbortController timeout covering headers and body; SSRF guard rejecting paths
  that resolve to a foreign origin before the Bearer token is attached.
- Google Meet creation (`add_meet` → `conferenceDataVersion=1` + `createRequest`),
  attendee management, `send_updates` notification control, reminders,
  recurrence (RRULE) and per-instance addressing of recurring events.
- Out of Office and Focus Time blocks with normalized auto-decline and chat
  status vocabularies (Google Workspace primary calendars only).
- Anonymous usage telemetry (`server_start` / `unconfigured_start` / `tool_call` /
  `startup_failed`; opt-out `ASKADS_TELEMETRY=0`).
- Offline test suite (mocked fetch / fake clients) + dist smoke test with a real
  MCP handshake over stdio; opt-in live smoke on a disposable event with cleanup
  after success and failure (`GOOGLE_CALENDAR_SMOKE_WRITE=1`).
- Capability documentation: one task-oriented page per tool under
  `docs/capabilities/`, enforced by tests.
