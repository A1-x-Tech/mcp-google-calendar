import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { GoogleCalendarClient } from "../dist/client.js";
import { registerCalendarTools } from "../dist/tools/calendars.js";
import { registerEventTools } from "../dist/tools/events.js";
import { registerAvailabilityTools } from "../dist/tools/availability.js";
import { registerRawTool } from "../dist/tools/raw.js";

const ALL_TOOLS = [
  "create_event",
  "create_focus_time",
  "create_out_of_office",
  "delete_event",
  "get_calendar",
  "get_event",
  "list_calendars",
  "list_event_instances",
  "list_events",
  "move_event",
  "query_free_busy",
  "raw_request",
  "update_event",
];

test("dist client rejects foreign-origin and non-calendar paths before sending the Bearer token", async () => {
  const original = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response("{}", { status: 200 });
  };
  try {
    const client = new GoogleCalendarClient({
      accessToken: "SECRET",
      apiBase: "https://www.googleapis.com",
      timeoutMs: 1000,
      maxRetries: 0,
    });
    await assert.rejects(() => client.request("GET", "https://example.invalid/steal"), /foreign origin/);
    // Same origin, different Google API: the calendar/v3/ pin must hold too.
    await assert.rejects(() => client.request("GET", "drive/v3/files"), /must stay under "calendar\/v3\/"/);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = original;
  }
});

test("dist client sends the Bearer token and JSON bodies", async () => {
  const original = globalThis.fetch;
  let seen;
  globalThis.fetch = async (url, init) => {
    seen = { url: String(url), auth: init.headers.Authorization, body: JSON.parse(init.body) };
    return new Response('{"id":"evt-1"}', { status: 200 });
  };
  try {
    const client = new GoogleCalendarClient({
      accessToken: "SECRET",
      apiBase: "https://www.googleapis.com",
      timeoutMs: 1000,
      maxRetries: 0,
    });
    await client.createEvent({
      calendarId: "primary",
      summary: "Smoke",
      startDateTime: "2026-09-01T10:00:00Z",
      endDateTime: "2026-09-01T11:00:00Z",
    });
    assert.equal(seen.url, "https://www.googleapis.com/calendar/v3/calendars/primary/events");
    assert.equal(seen.auth, "Bearer SECRET");
    assert.deepEqual(seen.body, {
      summary: "Smoke",
      start: { dateTime: "2026-09-01T10:00:00Z" },
      end: { dateTime: "2026-09-01T11:00:00Z" },
    });
  } finally {
    globalThis.fetch = original;
  }
});

test("dist registers the expected tools", () => {
  const names = [];
  const server = {
    registerTool(name) {
      names.push(name);
    },
  };
  const client = {};

  registerCalendarTools(server, client);
  registerEventTools(server, client);
  registerAvailabilityTools(server, client);
  registerRawTool(server, client);

  assert.deepEqual(names.sort(), ALL_TOOLS);
});

test("dist binary completes a real MCP handshake over stdio and lists every tool", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../dist/index.js", import.meta.url))],
    env: {
      ...process.env,
      GOOGLE_CALENDAR_ACCESS_TOKEN: "test-token",
      ASKADS_TELEMETRY: "0", // keep the suite offline
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "dist-smoke", version: "0.0.0" });
  await client.connect(transport);
  try {
    const server = client.getServerVersion();
    assert.equal(server?.name, "mcp-google-calendar");
    assert.match(String(server?.version), /^\d+\.\d+\.\d+$/);

    // The instructions the calling model reads before it picks any tool.
    const instructions = client.getInstructions();
    assert.equal(typeof instructions, "string");
    assert.ok(instructions.trim().length > 0, "initialize result carries no instructions");
    assert.match(instructions, /Google Calendar API v3/);

    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ALL_TOOLS);

    const listEvents = tools.find((t) => t.name === "list_events");
    assert.equal(listEvents.annotations?.readOnlyHint, true);
    assert.ok(listEvents.inputSchema?.properties?.calendar_id, "input schema must reach the client");

    const deleteEvent = tools.find((t) => t.name === "delete_event");
    assert.equal(deleteEvent.annotations?.destructiveHint, true);
  } finally {
    await client.close();
  }
});

/**
 * The degraded-start contract: without any credentials the binary must not
 * exit(1) before the handshake and leave the client a dead server with no
 * reason. It must start, list every tool, open the instructions with the fix,
 * and answer a tool call with the actionable error — offline: the
 * CredentialsError fires before any fetch, so this test never touches the
 * network.
 */
test("dist binary starts without credentials: handshake, tool list, actionable call error", async () => {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) => value !== undefined && !key.startsWith("GOOGLE_CALENDAR_"),
    ),
  );
  env.ASKADS_TELEMETRY = "0"; // keep the suite offline
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../dist/index.js", import.meta.url))],
    env,
    stderr: "pipe",
  });
  const client = new Client({ name: "dist-smoke-unconfigured", version: "0.0.0" });
  await client.connect(transport);
  try {
    // The model must read the fix before it picks a tool.
    const instructions = client.getInstructions() ?? "";
    assert.match(instructions, /not connected/);
    assert.match(instructions, /GOOGLE_CALENDAR_CLIENT_ID/);
    assert.match(instructions, /restart/);

    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ALL_TOOLS);

    // A tool call fails with the exact message instead of killing the server.
    const result = await client.callTool({ name: "list_calendars", arguments: {} });
    assert.equal(result.isError, true);
    const text = result.content.map((c) => c.text ?? "").join(" ");
    assert.match(text, /Google OAuth credentials are required: set GOOGLE_CALENDAR_CLIENT_ID/);
    assert.match(text, /restart the server/);
  } finally {
    await client.close();
  }
});
