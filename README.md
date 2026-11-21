# <img src="./assets/a1-logo.svg" alt="A1" width="40"> Google Calendar MCP

**English** | [Русский](./README.ru.md)

[![npm](https://img.shields.io/npm/v/%40a1-x-tech%2Fmcp-google-calendar)](https://www.npmjs.com/package/@a1-x-tech/mcp-google-calendar)
[![Glama](https://glama.ai/mcp/servers/A1-x-Tech/mcp-google-calendar/badges/score.svg)](https://glama.ai/mcp/servers/A1-x-Tech/mcp-google-calendar)
[![CI](https://github.com/A1-x-Tech/mcp-google-calendar/actions/workflows/ci.yml/badge.svg)](https://github.com/A1-x-Tech/mcp-google-calendar/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

**A1 Google Calendar MCP** lets an AI app manage Google Calendar in plain language. Review your week, schedule a meeting with guests and a Google Meet link, reschedule or cancel it, find a slot when everyone is free, and block Out of Office or Focus Time.

It uses the Google Calendar API with your Google account. It distinguishes a whole recurring series from a single occurrence and makes the limits of the Calendar API explicit instead of implying that every calendar task is possible.

- **19 tools.** Inspect calendars, events and free/busy, create and edit events, expand recurring series, and block Out of Office and Focus Time — plus six for connecting your Google account.
- **Sign in from the chat.** No credentials file to hand-write: ask the assistant to connect, approve access in the browser, and the very next request works — no restart. The client secret travels as a file path, never through the conversation.
- **Nobody is emailed by accident.** The Calendar API's default for invitations, changes and cancellations is silence; guests get email only when you ask for it via `send_updates`.
- **Writes are never replayed.** After an ambiguous failure the server does not retry a write — a duplicated event could re-email every guest.
- **Minimal Google scopes.** It uses `calendar.events` and `calendar.readonly`, without the broad `calendar` scope.

Start with a read-only question:

> What's on my calendar this week? Point out any overlapping meetings.

[Connect the server](#quick-start) · [Explore use cases](#what-you-can-ask-it-to-do) · [Open technical documentation](#technical-documentation)

---

## See it work in a minute

> **You:** What does my Thursday look like, and when are Anna and I both free?
>
> **Assistant:** Shows Thursday's events and the free slots you share. Nothing changes.
>
> **You:** Book a 45-minute design review with Anna in the first shared slot, with a Google Meet link.
>
> **Assistant:** Shows the proposed time, guest list and Meet link, then asks for confirmation before creating the event.
>
> **You:** Confirm.
>
> **Assistant:** Creates the event. Nobody gets an email unless you ask it to send invitations.

## Contents

- [Quick start](#quick-start)
- [What you can ask it to do](#what-you-can-ask-it-to-do)
- [How an event changes](#how-an-event-changes)
- [What can change](#what-can-change)
- [Getting access](#getting-access)
- [Configuration](#configuration)
- [Data, limits and background work](#data-limits-and-background-work)
- [Technical documentation](#technical-documentation)
- [Support](#support)

## Quick start

You need Node.js 20+ and a Google account. Credentials are not required at install time — the server connects from the conversation.

1. Add the server to your AI app.
2. Say "connect Google Calendar": the assistant gives you a Google sign-in link — [no Google Cloud project or OAuth client to create](#getting-access).
3. Ask the read-only question above.

<details open>
<summary><strong>Codex</strong></summary>

<br>

**In the app:** open **Settings → MCP servers**, select **Add server**, choose **STDIO**, enter the command `npx -y @a1-x-tech/mcp-google-calendar@latest`, then select **Save** and **Restart**.

**From the command line:**

```bash
codex mcp add google-calendar \
  -- npx -y @a1-x-tech/mcp-google-calendar@latest
```

```bash
codex mcp list
```

[Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)

</details>

<details>
<summary><strong>Claude Code</strong></summary>

<br>

```bash
claude mcp add \
  --transport stdio --scope user google-calendar \
  -- npx -y @a1-x-tech/mcp-google-calendar@latest
```

```bash
claude mcp list
```

[Claude Code MCP documentation](https://code.claude.com/docs/en/mcp)

</details>

<details>
<summary><strong>Claude Desktop</strong></summary>

<br>

The current official path is **Settings → Extensions**. For a custom desktop extension, open **Advanced settings → Extension Developer → Install Extension…**, select a `.mcpb` file and follow the prompts.

This repository currently publishes an npm stdio package and does not contain a `.mcpb` bundle. For Claude Desktop builds that still support local configuration, use the following JSON stdio configuration as a fallback:

```json
{
  "mcpServers": {
    "google-calendar": {
      "command": "npx",
      "args": ["-y", "@a1-x-tech/mcp-google-calendar@latest"]
    }
  }
}
```

In those builds, save it to `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS or `%APPDATA%\Claude\claude_desktop_config.json` on Windows.

[Claude Desktop MCP documentation](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)

</details>

<details>
<summary><strong>Cursor</strong></summary>

<br>

Add this to `~/.cursor/mcp.json` on macOS/Linux or `%USERPROFILE%\.cursor\mcp.json` on Windows:

```json
{
  "mcpServers": {
    "google-calendar": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@a1-x-tech/mcp-google-calendar@latest"]
    }
  }
}
```

[Cursor MCP documentation](https://cursor.com/docs/mcp)

</details>

<details>
<summary><strong>VS Code</strong></summary>

<br>

Run **MCP: Open User Configuration** and add:

```json
{
  "servers": {
    "google-calendar": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@a1-x-tech/mcp-google-calendar@latest"]
    }
  }
}
```

Check it with **MCP: List Servers**.

[VS Code MCP documentation](https://code.visualstudio.com/docs/agent-customization/mcp-servers)

</details>

## What you can ask it to do

### See your schedule

- What meetings do I have this week? Include the recurring ones.
- Show tomorrow's 1:1 with its guests, Meet link and reminders.
- List every occurrence of the team sync in March.

### Plan and change meetings

- Create a 45-minute review on Thursday with two guests and a Google Meet link.
- Reschedule the retro one hour later and update the guest list — but don't email anyone yet.
- Move the planning event to the team calendar.
- Cancel Friday's occurrence of the standup, leaving the rest of the series alone.

### Protect your time

- When are Anna, Boris and I all free for an hour next week?
- Block Out of Office for my vacation and auto-decline new invitations.
- Create two hours of Focus Time tomorrow morning and silence Google Chat.

## How an event changes

1. `calendar_id: "primary"` is your main calendar; other calendars come from `list_calendars`, and writes need writer access.
2. A recurring **series** and a single **occurrence** have different ids: the series id changes or cancels every occurrence, an instance id (from `list_event_instances`) exactly one.
3. `update_event` changes only the fields you provide, but a nested object replaces its predecessor wholesale — a new `attendees` list replaces the whole guest list.
4. No write emails anybody unless `send_updates` says so — the Calendar API's default is silence.

Out of Office and Focus Time blocks exist only on the primary calendar of a Google Workspace account; consumer Gmail and secondary calendars reject them. Creating an event does not check for conflicts — ask for a free/busy check first. All-day events end on an exclusive date: an event through Friday ends on Saturday's date.

## What can change

| Operation | What happens | Confirmation boundary |
|---|---|---|
| Read calendars, events and free/busy | Reads schedule data; free/busy shows busy blocks without titles | No change |
| Create an event | Adds a timed, all-day or recurring event, optionally with guests and Google Meet | Changes a calendar |
| Create an Out of Office or Focus Time block | Adds a special event that can auto-decline invitations or silence Google Chat | Changes a calendar |
| Update an event | Reschedules or edits an event; a series id edits every occurrence | Changes a calendar |
| Move an event | Re-homes an event to another calendar | Changes two calendars |
| Delete an event | Cancels an event or an entire series; there is no undelete | Destructive |
| Raw API request | Can call API methods without a dedicated tool | Potentially destructive |

The AI client controls confirmation prompts. The server marks reads, writes and destructive tools so the client can distinguish an inspection from a live change.

## Getting access

Access to your own calendars requires OAuth 2.0; an API key is not enough. There are two ways to connect, and the first one needs no configuration file at all.

### Sign in from the chat

Start the server with no credentials and ask the assistant to connect. The server ships with a built-in OAuth client, so there is no Google Cloud project or OAuth client to create — the assistant gives you a Google sign-in link and you approve access:

| Tool | What it does |
|---|---|
| `start_login` | Returns the Google authorization link and waits for the browser |
| `finish_login` | Confirms the login and reports which account was connected |
| `auth_status` | Whether a login exists, where it came from and when it expires — never the token itself |
| `logout` | Revokes the token at Google and deletes the local file |
| `setup_instructions` | Optional: the checklist for using your own Google Cloud OAuth client instead |
| `set_client` | Optional: reads your own OAuth client JSON — **by file path, so the secret never goes through the chat** |

Google may show a **"Google hasn't verified this app"** screen while the app's verification is in progress: choose **Advanced → Go to A1 MCP**. The built-in client only identifies the app to Google — the tokens are issued to and stored on your machine, and A1 never receives them.

The built-in client and its Google API quota are shared by everyone who uses it. Bring your own client (`setup_instructions`, then `set_client`) to get a quota of your own, or when a Google Workspace admin blocks third-party apps; it then takes priority over the built-in one.

The login takes effect immediately: the next tool call works without restarting the AI client. The token is stored in `~/.config/mcp-google-calendar/credentials.json` (on Windows, under `%APPDATA%`), readable only by your account, and never leaves your machine.

### Or configure environment variables

The classic path, and the one to use for CI and headless installs:

1. Create or select a Google Cloud project and enable **Google Calendar API**.
2. Configure the OAuth consent screen and create a **Desktop app** OAuth client.
3. Authorize the Google account whose calendars you want to manage. The [OAuth 2.0 Playground](https://developers.google.com/oauthplayground) can obtain the refresh token when **Use your own OAuth credentials** is enabled.
4. Request both scopes:

   ```text
   https://www.googleapis.com/auth/calendar.events
   https://www.googleapis.com/auth/calendar.readonly
   ```

   The broad `https://www.googleapis.com/auth/calendar` scope is needed only for `raw_request` calls that manage calendars or sharing rules themselves.

Environment variables always win over a login taken in the chat, so an existing configured install keeps behaving exactly as before.

Testing-mode OAuth refresh tokens can expire after seven days. Publish the OAuth app, or use an Internal app in a Workspace domain, when you need long-lived access. Treat the client secret and refresh token as passwords.

## Configuration

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_CALENDAR_CLIENT_ID` | No* | OAuth client ID. |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | No* | OAuth client secret. |
| `GOOGLE_CALENDAR_REFRESH_TOKEN` | No* | OAuth refresh token. |
| `GOOGLE_CALENDAR_ACCESS_TOKEN` | No* | Short-lived (~1 hour) alternative to the OAuth trio. |
| `GOOGLE_CALENDAR_API_BASE` | No | Google API base URL override; default `https://www.googleapis.com`. |
| `GOOGLE_CALENDAR_TIMEOUT_MS` | No | Per-request timeout; default `60000` ms. |
| `GOOGLE_CALENDAR_MAX_RETRIES` | No | Temporary-error retries; default `3`. |

\* Only for a setup without the in-chat login: provide either the OAuth trio or an access token.

## Data, limits and background work

- **Requests go to Google Calendar.** The local server refreshes Google OAuth tokens and calls the Calendar API. Its anonymous telemetry contains an installation ID, package version, AI client and platform versions, and tool names — never OAuth tokens, calendar data, tool arguments or prompts. For each tool call it also sends the outcome and, on failure, an excerpt of the error text with e-mails, addresses, tokens, numbers of 4+ digits and quoted text replaced by `#`; a value from your request can appear in it if the error text contains it. Set `ASKADS_TELEMETRY=0` to opt out.
- **Google applies per-project quotas.** On `429`, the server retries with backoff; reads also retry after network and `5xx` errors, while writes are not replayed after an uncertain failure — a duplicated event could re-email every guest.
- **There is no background polling.** The server runs only when called. `list_events` supports incremental checks via `updated_min`; if your AI app supports scheduled tasks, it can check your calendar periodically.

## Technical documentation

- [MCP capability catalog](./docs/capabilities/index.md) — task-oriented pages for every tool.
- [All tools and inputs](./docs/TOOLS.md)
- [Development documentation](./docs/DEVELOPMENT.md)
- [Publishing documentation](./docs/PUBLISHING.md)
- [Google Calendar API reference](https://developers.google.com/calendar/api)

## Support

Found a bug or need a scenario? [Create an issue](https://github.com/A1-x-Tech/mcp-google-calendar/issues) or write in [Telegram](https://t.me/a1_mcp).

<br>

<p align="center">
  <img src="https://github.com/ztemerbekov/a1-yandex-kit-skills/raw/main/assets/images/mona-hifive-yandex-kit-warm.gif" alt="Две Моны дают пять" width="256">
</p>

<p align="center">
  You made it to the end!
</p>
