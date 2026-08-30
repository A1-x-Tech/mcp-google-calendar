# Google Calendar: Disconnect from Google — MCP tool

**Google Calendar MCP tool:** Revokes the stored login at Google and deletes the local credentials file.

Technical name: `logout`

## What task it solves

> I want to disconnect this server from my Google account.

Revokes the stored token at Google (`oauth2.googleapis.com/revoke`) and deletes `~/.config/mcp-google-calendar/credentials.json`. After this, data tools fail with the "not connected" message until a new login or env credentials are provided.

## When to use it

Before handing the machine to someone else, to switch accounts cleanly (although `start_login` under the new account also replaces the old login), or when the user asks to disconnect.

## What to provide

Nothing — the tool takes no parameters.

## What it returns

Compact JSON: `removed`, `revoked`, `envTokenStillSet` and a `note`. When revoking at Google fails, the note points to https://myaccount.google.com/permissions for manual revocation.

## What changes

Deletes the stored login permanently — there is no undo; reconnecting needs a fresh browser consent. Tokens supplied via `GOOGLE_CALENDAR_*` environment variables are NOT touched (`envTokenStillSet: true` warns when they still keep the server connected). Calendar data is not modified.

## Example request

> Disconnect my Google Calendar account from this assistant.

## Errors and limitations

Only the stored in-chat login is removed — environment credentials must be removed from the MCP client config manually, followed by a restart. Revocation at Google is best-effort: a network failure still deletes the local file.

## Related MCP tools

- [Check the Google connection](./auth-status.md) — `auth_status`
- [Start the Google login](./start-login.md) — `start_login`

## Technical details

- **Impact:** destructive operation
- **Group:** Connection & login
- **Description source:** `registerGoogleAuth` (@a1-x-tech/mcp-google-auth), wired in `src/tools/auth.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
