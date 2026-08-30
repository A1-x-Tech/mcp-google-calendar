# Google Calendar: Save the OAuth client — MCP tool

**Google Calendar MCP tool:** Saves the OAuth client from the JSON file downloaded from Google Cloud Console, by file path.

Technical name: `set_client`

## What task it solves

> I want to hand the server my OAuth client so the in-chat login can work.

Reads the `client_secret_*.json` downloaded from Google Cloud Console ("Download JSON" on a Desktop-app client) at the given PATH and stores the client id and secret in `~/.config/mcp-google-auth/client.json` (owner-only). The secret never passes through the chat — only the file path does.

## When to use it

Once per machine, after creating the Desktop-app OAuth client from the `setup_instructions` checklist. The stored client is shared by every mcp-google-* server; tokens stay per-server.

## What to provide

- `path` — **required**. Absolute path to the downloaded `client_secret_*.json` file.

## What it returns

Compact JSON: `saved`, the `clientId`, `hasSecret`, the storage `path` and the next step (`start_login`).

## What changes

Writes `~/.config/mcp-google-auth/client.json` (0600, atomic), overwriting any previously stored client. No Google Calendar data is touched and no network call is made.

## Example request

> The client JSON is at /Users/me/Downloads/client_secret_1234.json — set it up.

## Errors and limitations

A "Web application" client JSON is rejected — the loopback login needs a client of type **Desktop app**. Unreadable paths and files without `installed.client_id` fail with instructions to re-download the JSON. Never paste the file's contents or the client_secret into the chat.

## Related MCP tools

- [Get setup instructions](./setup-instructions.md) — `setup_instructions`
- [Start the Google login](./start-login.md) — `start_login`
- [Check the Google connection](./auth-status.md) — `auth_status`

## Technical details

- **Impact:** changes data
- **Group:** Connection & login
- **Description source:** `registerGoogleAuth` (@a1-x-tech/mcp-google-auth), wired in `src/tools/auth.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
