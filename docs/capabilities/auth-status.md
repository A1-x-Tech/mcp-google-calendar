# Google Calendar: Check the Google connection — MCP tool

**Google Calendar MCP tool:** Shows whether the server is connected to Google — token presence, source, account and granted scopes.

Technical name: `auth_status`

## What task it solves

> I want to know whether this server is connected to Google, and as which account.

Reports the connection state without any network call: whether a token exists, where it comes from (environment variables or a stored in-chat login), when the stored token expires, the Google account email, granted vs missing OAuth scopes, where the credentials file lives and which OAuth client would be used. It never returns the token itself.

## When to use it

Call it first when other tools report that the server is not connected, when the user asks "which account is this?", or before `start_login` to see whether a login already exists.

## What to provide

Nothing — the tool takes no parameters.

## What it returns

Compact JSON: `connected`, `source` (`env`/`stored`), `expiresAt`, `accountEmail`, `grantedScopes`, `missingScopes` (when the user granted only part of the consent), `canRefresh`, the credentials `path` and `clientSource`.

## What changes

Nothing. The tool only reads local state — no network calls, no writes.

## Example request

> Is my Google Calendar connected, and under which account?

## Errors and limitations

For tokens supplied via environment variables the scopes and account email are unknown to the server, so those fields are absent. The tool cannot detect a token that was revoked at Google — only a real API call can.

## Related MCP tools

- [Start the Google login](./start-login.md) — `start_login`
- [Get setup instructions](./setup-instructions.md) — `setup_instructions`
- [Disconnect from Google](./logout.md) — `logout`

## Technical details

- **Impact:** read-only
- **Group:** Connection & login
- **Description source:** `registerGoogleAuth` (@a1-x-tech/mcp-google-auth), wired in `src/tools/auth.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
