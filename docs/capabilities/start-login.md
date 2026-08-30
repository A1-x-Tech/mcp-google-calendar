# Google Calendar: Start the Google login — MCP tool

**Google Calendar MCP tool:** Begins the in-chat Google login and returns the consent link to open in the browser.

Technical name: `start_login`

## What task it solves

> I want to connect my Google account from the chat, without editing config files or restarting.

Starts the loopback OAuth flow: binds a one-shot listener on `127.0.0.1` and returns `authorizeUrl` — the assistant shows it to the user as a clickable link. The user opens it in a browser ON THE SAME machine, picks the Google account and approves access; Google redirects back to the local listener, where the code is exchanged locally. The code never passes through the chat, and the tool never opens the browser itself.

## When to use it

When the server is NOT CONNECTED and an OAuth client is configured (`set_client` done, or `GOOGLE_CALENDAR_CLIENT_ID` set), or to re-login — e.g. after a partial consent or to switch accounts.

## What to provide

Nothing — the tool takes no parameters. Optional environment: `GOOGLE_CALENDAR_OAUTH_PORT` pins the listener port (useful over SSH with `-L` port forwarding; the response adds a hint in SSH sessions).

## What it returns

Compact JSON: `authorizeUrl`, `expiresInMinutes` (10) and `nextStep` — when the browser shows the success page, call `finish_login`.

## What changes

Starts a pending login attempt and binds a local one-shot listener (a second `start_login` replaces the first). Nothing is stored yet and no calendar data is touched — tokens appear only after `finish_login`.

## Example request

> Log me in to Google Calendar.

## Errors and limitations

Deliberately **not** marked read-only, so AI clients ask for confirmation — a login must never start silently. Fails with actionable advice when no OAuth client is configured. The attempt lives 10 minutes; the browser must reach `127.0.0.1` of the machine running the server (over SSH, forward the port). The login requests the scopes `calendar.events` + `calendar.readonly` plus identity.

## Related MCP tools

- [Finish the Google login](./finish-login.md) — `finish_login`
- [Save the OAuth client](./set-client.md) — `set_client`
- [Get setup instructions](./setup-instructions.md) — `setup_instructions`

## Technical details

- **Impact:** changes data
- **Group:** Connection & login
- **Description source:** `registerGoogleAuth` (@a1-x-tech/mcp-google-auth), wired in `src/tools/auth.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
