# Google Calendar: Finish the Google login — MCP tool

**Google Calendar MCP tool:** Completes the in-chat login — saves the tokens and verifies the connection against the Calendar API.

Technical name: `finish_login`

## What task it solves

> I want to complete the login I approved in the browser and start using my calendar.

Confirms the browser consent finished, saves the tokens to an owner-only file (`~/.config/mcp-google-calendar/credentials.json`) and verifies the login with a read-only Calendar API call (the primary calendar-list entry), returning the account email and granted scopes. Every tool works immediately afterwards — no client restart.

## When to use it

Right after the user reports the browser shows the "Login complete" page from `start_login`.

## What to provide

Nothing — the tool takes no parameters.

## What it returns

Compact JSON: `connected`, `accountEmail`, `grantedScopes`, `missingScopes` + `scopeWarning` when the user granted only part of the consent, `previousAccountEmail` when a different account was replaced, `storedAt` and a `note`.

## What changes

Writes the credentials file (atomic, 0600). Logging in under a different Google account replaces the previous login and revokes its refresh token at Google (best-effort). Calendar data itself is only read (the identity check), never modified.

## Example request

> The browser says the login is complete — finish it.

## Errors and limitations

Fails when no login is in progress or the 10-minute attempt expired (run `start_login` again). A partial consent is saved, not rejected — `missingScopes` lists what will not work. A failed identity check does not cancel a saved login; the response says so and suggests trying a data tool. Tokens never appear in the output.

## Related MCP tools

- [Start the Google login](./start-login.md) — `start_login`
- [Check the Google connection](./auth-status.md) — `auth_status`
- [List calendars](./list-calendars.md) — `list_calendars`

## Technical details

- **Impact:** changes data
- **Group:** Connection & login
- **Description source:** `registerGoogleAuth` (@a1-x-tech/mcp-google-auth), wired in `src/tools/auth.ts`; identity check `fetchCalendarIdentity` in `src/client.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
