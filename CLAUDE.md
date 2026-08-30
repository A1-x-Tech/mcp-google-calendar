# CLAUDE.md — mcp-google-calendar

MCP server for the Google Calendar API v3 (TypeScript, stdio). Mixed read/write:
tools cover calendar listing, event CRUD + move, recurring-event instances,
free/busy and Out of Office / Focus Time blocks; `raw_request` is the escape
hatch. The server talks to `https://www.googleapis.com` (paths `calendar/v3/...`)
with a Bearer token; the token is minted from an OAuth2 refresh token via
`https://oauth2.googleapis.com/token` (or a static `GOOGLE_CALENDAR_ACCESS_TOKEN`,
mostly for testing), or — when the environment carries no credentials — comes
from the in-chat login of `@a1-x-tech/mcp-google-auth` (six onboarding tools;
env always beats the stored login).

## Commands

```bash
npm run dev        # run from source (tsx watch)
npm test           # unit tests + dist smoke, no network
npm run typecheck  # types for src + tests
npm run build      # emit dist/
npm run smoke      # live check: read-only by default; GOOGLE_CALENDAR_SMOKE_WRITE=1 opts into a disposable create→get→delete cycle with cleanup in finally
```

## Architecture

- `src/config.ts` — env → config. Credentials: either the refresh triple
  `GOOGLE_CALENDAR_CLIENT_ID` + `GOOGLE_CALENDAR_CLIENT_SECRET` + `GOOGLE_CALENDAR_REFRESH_TOKEN`
  (all three or `ConfigError` `incomplete_oauth_config`) or `GOOGLE_CALENDAR_ACCESS_TOKEN`;
  optional `GOOGLE_CALENDAR_API_BASE`, `GOOGLE_CALENDAR_TIMEOUT_MS`, `GOOGLE_CALENDAR_MAX_RETRIES`.
  No credentials at all is NOT an error: the fields stay `undefined` and the server starts
  degraded. Also home to `CredentialsError` / `MISSING_CREDENTIALS_MESSAGE` (names the
  variables and the restart) and `hasCredentials()`.
- `src/client.ts` — all HTTP and all wire mapping. Token lifecycle (cache until ~60s before
  expiry, dedupe concurrent refreshes, one forced re-mint + replay on 401); `request()`
  resolves the path against the base, rejects foreign origins (SSRF guard) and pins the
  resolved pathname under `calendar/v3/` (www.googleapis.com hosts every Google API — a
  broadly-scoped token must not turn `raw_request` into a Drive/Gmail proxy), enforces an
  AbortController timeout that also covers reading the body, retries 429 always but 5xx/network
  errors **only for GET** — replaying a write after an ambiguous failure would duplicate the
  event and can re-email every guest — and throws `GoogleCalendarError(status, body)`. Typed
  per-endpoint methods own the wire vocabulary: `buildEventTimes()`/`buildEventBody()` map the
  normalized snake_case inputs to the Event resource (all-day `date` pair XOR timed `dateTime`
  pair, Meet `createRequest` with a fresh `requestId` + `conferenceDataVersion=1`, reminders
  `useDefault`/`overrides`), and the mapping helpers translate `send_updates`
  (`external_only` → `externalOnly`), `event_types` (`focus_time` → `focusTime`),
  `auto_decline` (`all` → `declineAllConflictingInvitations`), `chat_status`
  (`do_not_disturb` → `doNotDisturb`) and `min_access_role` (`free_busy_reader` → `freeBusyReader`).
- `src/tools/calendars.ts` — `list_calendars`, `get_calendar` (calendarList reads).
  `src/tools/events.ts` — `list_events`, `get_event`, `create_event`, `update_event` (PATCH),
  `delete_event`, `move_event` (events.move), `list_event_instances`.
  `src/tools/availability.ts` — `query_free_busy`, `create_out_of_office`, `create_focus_time`
  (eventType events; Workspace primary calendars only).
  `src/tools/raw.ts` — `raw_request` (GET/POST/PUT/PATCH/DELETE). `src/tools/util.ts` —
  `ok`/`fail`, the four annotation presets (`READ_ONLY`/`WRITE`/`UPDATE`/`DESTRUCTIVE`) and
  shared zod schema factories (`calendarIdSchema`, `eventIdSchema`, `rfc3339Timestamp`,
  `dateOnlySchema`, `timeZoneSchema`, `sendUpdatesSchema`).
  `src/tools/auth.ts` — the in-chat login: `AUTH_OPTIONS` (serverName `calendar`,
  envPrefix `GOOGLE_CALENDAR`, the two minimal scopes, `verifyIdentity` =
  `fetchCalendarIdentity` in client.ts), `registerAuthTools` wraps the component's
  `registerGoogleAuth` (six tools: `auth_status`, `setup_instructions`, `set_client`,
  `start_login` — deliberately NOT read-only, `finish_login`, `logout`) and returns the
  `TokenProvider` the client takes as its fallback token source; `hasAuthToken` /
  `authUnconfiguredPrefix` feed index.ts.
- `src/index.ts` — wires every `register*` into the McpServer. `loadConfigOrDegraded()`
  catches `ConfigError`, pings `startup_failed` (fire-and-forget) and degrades the config to
  "no credentials"; an unconfigured start prepends `UNCONFIGURED_PREFIX` — plus
  `Configuration problem: <message>` when a ConfigError was caught — to the initialize
  `instructions`, and `oninitialized` sends `server_start` for a configured install or
  `unconfigured_start` (with the reason) otherwise.
- `src/telemetry.ts` — anonymous usage pings (ids/names/versions only, never data or
  arguments; fire-and-forget, must never block or throw; opt-out `ASKADS_TELEMETRY=0`;
  instance id in `~/.config/mcp-google-calendar/instance-id`). `server_start` means "a usable
  install started"; `unconfigured_start` is a degraded start and `startup_failed` a malformed
  config caught at load — both carry a `reason` from a closed vocabulary
  (`missing_credentials`, `incomplete_oauth_config`) — never a variable's name or value.

## Conventions (do not break)

- **Never exit because of configuration.** A server that dies before the MCP handshake leaves
  the user with a red cross and no reason — telemetry across this line of servers showed that
  state accounted for nearly every unconfigured install, and almost none of them recovered.
  Missing credentials are a survivable state: start, answer initialize (with the unconfigured
  prefix in `instructions` — it now leads with the in-chat login) and tools/list, and let the
  first data-tool call fail with the component's `AuthRequiredError`, which names BOTH fixes
  (start_login and the env variables + restart). `CredentialsError` remains the client's
  own fallback when no token provider is wired. `config.test.ts`, `client.test.ts` and
  `test/dist-smoke.test.js` pin this.
- **Credential failures are not transport failures.** `CredentialsError` is thrown in
  `accessToken()` before any fetch — before the retry/backoff loop, the token mint and the
  401 replay — because retrying it burns seconds of backoff before the user sees the one
  message that helps. Pinned by the "fetch never called" assertion in `client.test.ts`.
- **Never retry a write on 5xx/network errors.** Only 429 (rejected before executing) and GET
  are safe; the gate lives in `request()` and is pinned by tests. A replayed event create
  duplicates the meeting and can re-email every guest.
- **Wire mapping lives in the client, not the tools.** Tools accept the normalized snake_case
  vocabulary and must not know the wire enums (`externalOnly`, `startTime`, `outOfOffice`,
  `declineAllConflictingInvitations`, `doNotDisturb`, `freeBusyReader`) — add any mapping in
  `client.ts`.
- **Auth is the client's job.** Tools never see tokens; the Bearer header, refresh, caching
  and the 401 replay all live in `request()`/`accessToken()`. The in-chat login's
  `TokenProvider` is only a fallback inside `accessToken()`: env credentials always win
  (component invariant 3 — pinned in `client.test.ts`), and `AuthRequiredError` must keep
  propagating before the retry/backoff loop.
- **Notifications are explicit.** Every mutating event tool exposes `send_updates`; the API
  default is silence, and descriptions must keep saying so — a model that assumes guests were
  emailed produces broken workflows.
- **Recurring events are addressed by the right id.** The series master id changes/cancels
  every occurrence; an instance id (via `list_event_instances`) exactly one. Descriptions
  must keep steering the model to `list_event_instances` before single-occurrence edits.
- **Validate inputs with zod** in `inputSchema`; reuse the shared schema **factories** in
  `util.ts` (a fresh schema per field avoids `$ref` dedup in the JSON schema).
- **Annotations are pinned per tool** in `annotations.test.ts` — changing one is a conscious
  decision that updates the map, with all four hints always set.
- **Output compact JSON via `ok`** — the consumer is an LLM; pretty-printing burns tokens.
  Responses pass through verbatim (describe the fields in the tool `description`, the only
  place the external model reads).

## Adding a tool

Before changing the tool registry, read [the MCP capability documentation contract](docs/CAPABILITY-DOCUMENTATION.md). Every registered tool must have exactly one task-oriented page in `docs/capabilities/`; update that page, the index, and the coverage test in the same change.

1. Add (or extend) `src/tools/<name>.ts` with `register<Name>Tools(server, client)`.
2. If it hits a new endpoint, add a method to `src/client.ts` with the wire mapping.
3. Import and call the register fn in `src/index.ts`.
4. Add a `*.test.ts` using the mock-fetch (client) / fake-client (tools) harness — no
   network — and add the tool + hints to `annotations.test.ts` and `test/dist-smoke.test.js`.
5. `npm run typecheck && npm test`.

## Releasing

Keep the version in sync across **all** channels in one go (`git push --follow-tags` pushes
the tag but does **not** create a GitHub Release; the registry is immutable per version):

1. Bump `version` in **three places, identically**: `package.json`, and in `server.json`
   **both** the root `version` **and** `packages[0].version`. `mcpName` in `package.json` must
   match `name` in `server.json` (`io.github.A1-x-Tech/mcp-google-calendar`). Verify:
   `grep -n '"version"' package.json server.json`.
   > ⚠️ `mcp-publisher` publishes the **root** `server.json.version`. A stale root makes
   > `mcp-publisher publish` fail with a misleading `400 cannot publish duplicate version`
   > while `npm publish` succeeds.
2. Update `CHANGELOG.md`, then `npm publish` (runs typecheck + tests + build via
   `prepublishOnly` / `prepare`; the scoped package needs the committed
   `"publishConfig": { "access": "public" }`).
3. `git commit`, `git tag -a vX.Y.Z -m vX.Y.Z`, `git push origin main --follow-tags`.
4. **GitHub Release:** `gh release create vX.Y.Z --title vX.Y.Z --generate-notes --verify-tag`.
5. **Official MCP registry:** `mcp-publisher publish` (login with
   `mcp-publisher login github --token "$(gh auth token)"`).
