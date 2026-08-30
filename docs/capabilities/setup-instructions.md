# Google Calendar: Get setup instructions — MCP tool

**Google Calendar MCP tool:** Returns the step-by-step checklist for connecting this server to Google from the chat.

Technical name: `setup_instructions`

## What task it solves

> I want to connect Google Calendar and be walked through the setup.

Returns the checklist for the one-time setup: creating a Google Cloud project, enabling the Calendar API, publishing the OAuth consent screen (mandatory — Testing-mode refresh tokens die after 7 days), creating a Desktop-app OAuth client, downloading its JSON and handing the file PATH to `set_client`. When an OAuth client is already configured (one client serves the whole mcp-google-* line), the checklist shortens to "enable the API + log in".

## When to use it

Use it when the server reports NOT CONNECTED and no OAuth client is configured yet, or whenever the user asks how to set up the connection.

## What to provide

Nothing — the tool takes no parameters.

## What it returns

Compact JSON: `clientConfigured`, ordered `steps`, the OAuth `scopes` the login will request (`calendar.events` + `calendar.readonly` plus the identity scopes) and safety `notes`. Secrets are never requested through the chat — credentials travel only as file paths or environment variables.

## What changes

Nothing. The tool only reads the local client configuration to tailor the checklist.

## Example request

> How do I connect my Google Calendar to this assistant?

## Errors and limitations

The checklist covers the user-owned Desktop OAuth client flow; Google Workspace domains that block unverified apps need an admin allowlist instead. The tool cannot verify that the steps were actually completed — `start_login` will surface any remaining problem.

## Related MCP tools

- [Save the OAuth client](./set-client.md) — `set_client`
- [Start the Google login](./start-login.md) — `start_login`
- [Check the Google connection](./auth-status.md) — `auth_status`

## Technical details

- **Impact:** read-only
- **Group:** Connection & login
- **Description source:** `registerGoogleAuth` (@a1-x-tech/mcp-google-auth), wired in `src/tools/auth.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
