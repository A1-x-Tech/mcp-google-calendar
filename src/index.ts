#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GoogleCalendarClient } from "./client.js";
import { ConfigError, DEFAULT_BASE, hasCredentials, loadConfig } from "./config.js";
import { instrumentToolCalls, Telemetry } from "./telemetry.js";
import type { GoogleCalendarConfig } from "./types.js";
import { registerCalendarTools } from "./tools/calendars.js";
import { registerEventTools } from "./tools/events.js";
import { registerAvailabilityTools } from "./tools/availability.js";
import { registerRawTool } from "./tools/raw.js";

/**
 * Prose handed to the calling model in the `initialize` result — the only place
 * it learns what the tool list cannot say: which Google product this API is,
 * what the API refuses to do, and the behaviours that make a naive loop
 * expensive, lossy or duplicating.
 */
const INSTRUCTIONS =
  "Google Calendar API v3 reads and writes calendar events — not Gmail, Tasks, Contacts or Meet " +
  'recordings. calendar_id "primary" is the user\'s main calendar; others come from list_calendars ' +
  "(writes need accessRole writer/owner). Times are RFC3339; all-day events use dates with an " +
  "EXCLUSIVE end date; time zones are IANA names and a list_events time_zone only re-renders the " +
  "response. For \"what's on the calendar\" questions use single_events=true (expands recurring " +
  "events; required for order_by=start_time). Recurring series: the master id addresses every " +
  "occurrence, an instance id (via list_event_instances) exactly one — update/delete accordingly. " +
  "No write notifies guests unless send_updates=all: invitations, changes and cancellations are " +
  "silent by default. add_meet may return a pending conference — re-run get_event for the final " +
  "link. create_event does not check conflicts (query_free_busy first); free/busy returns only " +
  "busy blocks, never titles. Out of Office / Focus Time exist only on Google Workspace PRIMARY " +
  "calendars — consumer Gmail gets HTTP 400. Writes hit live calendars and are never retried " +
  "after a 5xx or timeout: re-sending a create duplicates the event and can re-email every guest — " +
  "check with list_events/get_event first. delete_event is final and can cancel a whole series.";

/**
 * Prepended to INSTRUCTIONS when no credentials are configured. The model reads
 * this before it picks a tool, so an unconfigured session opens with the fix
 * rather than with a failed call. There is no in-chat login here: credentials
 * come only from the environment, so the fix is an operator action + restart.
 */
const UNCONFIGURED_PREFIX =
  "ATTENTION: Google Calendar is not connected yet — no credentials are configured, so every " +
  "tool call will fail. The operator must set GOOGLE_CALENDAR_CLIENT_ID + " +
  "GOOGLE_CALENDAR_CLIENT_SECRET + GOOGLE_CALENDAR_REFRESH_TOKEN (recommended), or " +
  "GOOGLE_CALENDAR_ACCESS_TOKEN with a short-lived access token, in the MCP client's " +
  "server config and restart this server — the variables are read only at startup. ";

/** Reads the package version so the server reports its real version to MCP clients. */
function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Loads the config without dying on a bad value. A server that exits here never
 * completes the MCP handshake, so the user sees a dead server and no reason.
 * Instead the problem is carried into the session, where the model can read it
 * and relay it: the config degrades to "no credentials" and every tool call
 * fails with the actionable message.
 */
function loadConfigOrDegraded(telemetry: Telemetry): {
  config: GoogleCalendarConfig;
  problem?: ConfigError;
} {
  try {
    return { config: loadConfig() };
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    console.error(`Error: ${err.message}`);
    // Fire-and-forget now that the process survives: the historical
    // `startup_failed` funnel stays comparable, but nothing blocks startup.
    telemetry.send("startup_failed", { reason: err.reason });
    return {
      config: { apiBase: process.env.GOOGLE_CALENDAR_API_BASE || DEFAULT_BASE },
      problem: err,
    };
  }
}

async function main(): Promise<void> {
  // Anonymous usage pings (ids/names/versions only, never data or arguments);
  // opt out with ASKADS_TELEMETRY=0. Built before the config so missing
  // credentials can be reported; wired to the server before tools register.
  const telemetry = new Telemetry(readVersion());
  const { config, problem } = loadConfigOrDegraded(telemetry);
  const client = new GoogleCalendarClient(config);

  // Decided once, at startup: credentials come only from the environment, so
  // "restart after setting the variables" is the accurate advice to give.
  const connected = hasCredentials(config);

  const server = new McpServer(
    {
      name: "mcp-google-calendar",
      version: readVersion(),
    },
    // Surfaces in the initialize result, before the client sees a single tool.
    {
      instructions: connected
        ? INSTRUCTIONS
        : UNCONFIGURED_PREFIX + (problem ? `Configuration problem: ${problem.message} ` : "") + INSTRUCTIONS,
    },
  );

  instrumentToolCalls(server, telemetry);
  server.server.oninitialized = () => {
    telemetry.setClientInfo(server.server.getClientVersion());
    // Split on purpose: `server_start` keeps meaning "a usable install started",
    // so the unconfigured case gets its own event instead of inflating that number.
    if (connected) telemetry.send("server_start");
    else telemetry.send("unconfigured_start", { reason: problem?.reason ?? "missing_credentials" });
  };

  registerCalendarTools(server, client);
  registerEventTools(server, client);
  registerAvailabilityTools(server, client);
  registerRawTool(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `mcp-google-calendar running on stdio${connected ? "" : " (no credentials — set the environment variables and restart)"}`,
  );
}

main().catch((err) => {
  console.error("Fatal error starting mcp-google-calendar:", err);
  process.exit(1);
});
