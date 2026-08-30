# Development

## Requirements

- Node.js 20+ (the published package ships compiled `dist/`; `npx` needs no separate
  install). CI runs the suite on Node 20, 22 and 24.

## Commands

```bash
npm install
npm run dev        # run from source with tsx watch
npm test           # unit tests (node:test) + dist smoke, no network
npm run typecheck  # type-check src + tests (no emit)
npm run build      # clean dist/ and compile with tsc
npm run smoke      # live check (read-only by default; see below)
```

## Local run

```bash
npm run build
GOOGLE_CALENDAR_CLIENT_ID=... GOOGLE_CALENDAR_CLIENT_SECRET=... GOOGLE_CALENDAR_REFRESH_TOKEN=... \
  node dist/index.js
# or, for a quick session with a short-lived token:
GOOGLE_CALENDAR_ACCESS_TOKEN=$(gcloud auth print-access-token) node dist/index.js
# optional: GOOGLE_CALENDAR_API_BASE, GOOGLE_CALENDAR_TIMEOUT_MS, GOOGLE_CALENDAR_MAX_RETRIES
```

## OAuth scopes

Mint the refresh token with the **minimal** scopes:

- `https://www.googleapis.com/auth/calendar.events` — event reads and writes
  (including Out of Office / Focus Time blocks);
- `https://www.googleapis.com/auth/calendar.readonly` — the calendar list and
  free/busy queries.

The broad `https://www.googleapis.com/auth/calendar` scope is required only if
`raw_request` will manage calendars or ACLs themselves.

## Live smoke

`npm run smoke` is READ-ONLY by default: with a calendar id (first argv or
`GOOGLE_CALENDAR_SMOKE_CALENDAR_ID`) it fetches that calendar and lists up to five
upcoming events; without one it just mints an access token from the refresh token.

`GOOGLE_CALENDAR_SMOKE_WRITE=1` opts into the full write cycle on a **disposable
resource**: a uniquely-named, guest-free, 15-minute event one year in the future is
created on the smoke calendar (default `primary`), verified with a read, and
deleted in a `finally` block — cleanup runs after success **and** after a mid-cycle
error. If the delete itself fails, the event id is printed for manual removal and
the process exits non-zero.

## Tests

Unit tests mock `globalThis.fetch` (client) or use a fake server + fake client
(tools), so the whole suite runs offline — including the OAuth refresh flow, whose
token endpoint is served by the same fetch stub. `test/dist-smoke.test.js`
additionally spawns the built `dist/index.js` and performs a real MCP handshake
over stdio through the official SDK, asserting the server identity and the full
tool list — with and without credentials (the degraded-start contract). Put a
`*.test.ts` next to the code it covers; `npm run typecheck && npm test` is the
gate (also run by `prepublishOnly`).

## Usage telemetry

The server sends anonymous events to `usage.gistrec.cloud` (`server_start` when a
client connects to a configured install, `unconfigured_start` when a client
connects to a server without credentials, `tool_call` with the tool **name**, and
`startup_failed` with a fixed-vocabulary reason code when the configuration is
malformed) to count active installs and tool demand. An event carries only
impersonal technical fields: a random installation id
(`~/.config/mcp-google-calendar/instance-id`), the package version, the AI
client's name and version from the MCP handshake, the Node.js version and the OS.

OAuth credentials, calendar data, tool arguments and prompts are never sent or
stored (implementation: `src/telemetry.ts`). Sends run in the background with a
2 s timeout and are silently skipped on any error. Opt out for all servers of
this line at once: `ASKADS_TELEMETRY=0`.
