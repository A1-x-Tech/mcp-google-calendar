# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and the project adheres to [Semantic Versioning](https://semver.org/).

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
