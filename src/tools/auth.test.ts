import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AUTH_OPTIONS,
  authUnconfiguredPrefix,
  CALENDAR_SCOPES,
  hasAuthToken,
  registerAuthTools,
} from "./auth.js";

/**
 * Routing tests for the six onboarding tools the @a1-x-tech/mcp-google-auth
 * component registers on this server. The component's own suite covers the
 * OAuth flow in depth; these tests pin the CALENDAR-SPECIFIC wiring — tool
 * set, options (env prefix, server name, scopes) and the degraded behavior —
 * fully offline and against an isolated config dir.
 */

interface Captured {
  config: { title?: string; description?: string; annotations?: Record<string, boolean> };
  handler: (args: Record<string, unknown>) => Promise<{ isError?: boolean; content: { text?: string }[] }>;
}

function fakeServer(): { tools: Map<string, Captured>; server: never } {
  const tools = new Map<string, Captured>();
  const server = {
    registerTool: (name: string, config: Captured["config"], handler: Captured["handler"]) => {
      tools.set(name, { config, handler });
    },
  };
  return { tools, server: server as never };
}

const ENV_KEYS = [
  "GOOGLE_CALENDAR_CLIENT_ID",
  "GOOGLE_CALENDAR_CLIENT_SECRET",
  "GOOGLE_CALENDAR_REFRESH_TOKEN",
  "GOOGLE_CALENDAR_ACCESS_TOKEN",
  "GOOGLE_CALENDAR_OAUTH_PORT",
];
const savedEnv = new Map<string, string | undefined>();
let configDir: string;

before(() => {
  // Isolate from the developer's real login and env: the component reads
  // GOOGLE_CALENDAR_* live and re-reads $XDG_CONFIG_HOME files per call.
  for (const key of [...ENV_KEYS, "XDG_CONFIG_HOME"]) savedEnv.set(key, process.env[key]);
  for (const key of ENV_KEYS) delete process.env[key];
  configDir = mkdtempSync(join(tmpdir(), "mcp-gcal-auth-test-"));
  process.env.XDG_CONFIG_HOME = configDir;
});

after(() => {
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(configDir, { recursive: true, force: true });
});

test("options pin the calendar wiring: env prefix, server name and documented scopes", () => {
  assert.equal(AUTH_OPTIONS.envPrefix, "GOOGLE_CALENDAR", "must read the same variables as config.ts");
  assert.equal(AUTH_OPTIONS.serverName, "calendar", "token path must be mcp-google-calendar/credentials.json");
  assert.deepEqual(CALENDAR_SCOPES, [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.readonly",
  ]);
  assert.equal(typeof AUTH_OPTIONS.verifyIdentity, "function", "finish_login must verify via the Calendar API");
});

test("registers exactly the six contract tools and returns the shared TokenProvider", () => {
  const { tools, server } = fakeServer();
  const provider = registerAuthTools(server);
  assert.deepEqual(
    [...tools.keys()].sort(),
    ["auth_status", "finish_login", "logout", "set_client", "setup_instructions", "start_login"],
  );
  for (const [name, tool] of tools) {
    assert.ok(tool.config.title, `${name} needs a title`);
    assert.ok(tool.config.description, `${name} needs a description`);
    assert.ok(tool.config.annotations, `${name} needs annotations`);
  }
  // The provider is what the GoogleCalendarClient plugs in as fallback.
  assert.equal(typeof provider.getAccessToken, "function");
  assert.equal(typeof provider.canRefresh, "function");
  assert.equal(provider.hasToken(), false, "isolated config dir must read as not connected");
});

test("env priority flows through the provider: GOOGLE_CALENDAR_ACCESS_TOKEN wins (invariant 3)", async () => {
  const { server } = fakeServer();
  const provider = registerAuthTools(server);
  process.env.GOOGLE_CALENDAR_ACCESS_TOKEN = "ENV-TOK";
  try {
    assert.equal(provider.hasToken(), true);
    assert.equal(await provider.getAccessToken(), "ENV-TOK");
    assert.equal(hasAuthToken(), true, "index.ts's connected check must see the env token");
  } finally {
    delete process.env.GOOGLE_CALENDAR_ACCESS_TOKEN;
  }
  assert.equal(hasAuthToken(), false, "and read the environment live, not once");
});

test("auth_status routes to the provider: not connected, calendar paths, no error", async () => {
  const { tools, server } = fakeServer();
  registerAuthTools(server);
  const result = await tools.get("auth_status")!.handler({});
  assert.ok(!result.isError, "auth_status must not fail without credentials");
  const status = JSON.parse(result.content[0].text!) as { connected: boolean; path: string };
  assert.equal(status.connected, false);
  assert.match(status.path, /mcp-google-calendar/, "credentials path must be the calendar's own dir");
});

test("setup_instructions works without any credentials and asks for the calendar scopes", async () => {
  const { tools, server } = fakeServer();
  registerAuthTools(server);
  const result = await tools.get("setup_instructions")!.handler({});
  assert.ok(!result.isError);
  const guide = JSON.parse(result.content[0].text!) as { clientConfigured: boolean; scopes: string[] };
  assert.equal(guide.clientConfigured, false);
  for (const scope of CALENDAR_SCOPES) {
    assert.ok(guide.scopes.includes(scope), `setup guide must request ${scope}`);
  }
});

test("start_login without an OAuth client fails actionably, naming set_client and the env variables", async () => {
  const { tools, server } = fakeServer();
  registerAuthTools(server);
  const result = await tools.get("start_login")!.handler({});
  assert.equal(result.isError, true);
  const text = result.content.map((c) => c.text ?? "").join(" ");
  assert.match(text, /set_client/);
  assert.match(text, /GOOGLE_CALENDAR_CLIENT_ID/, "the advice must name this server's variables");
});

test("the unconfigured prefix offers the in-chat login first and the env path as alternative", () => {
  const prefix = authUnconfiguredPrefix();
  assert.match(prefix, /NOT CONNECTED/);
  assert.match(prefix, /start_login/);
  assert.match(prefix, /setup_instructions/);
  assert.match(prefix, /GOOGLE_CALENDAR_CLIENT_ID/);
  assert.match(prefix, /restart/);
});

/**
 * A disabled Calendar API is the likeliest failure right after a wizard-path
 * login, and the component cannot recognise it: only this server knows what a
 * Calendar 403 means. Without the translation finish_login says "HTTP 403:
 * PERMISSION_DENIED" and sends the user to audit calendar sharing they cannot
 * fix; with it, they get the one instruction that works — enable the API.
 * Both of Google's spellings must be caught, and nothing else may be swallowed.
 */
test("verifyIdentity turns a disabled-API 403 into the enable-the-API advice", async () => {
  const verify = AUTH_OPTIONS.verifyIdentity!;
  const originalFetch = globalThis.fetch;

  const respond = (body: string, status: number) => {
    globalThis.fetch = (async () => new Response(body, { status })) as typeof fetch;
  };

  try {
    // Legacy spelling: error.errors[].reason
    respond('{"error":{"code":403,"errors":[{"reason":"accessNotConfigured"}]}}', 403);
    await assert.rejects(() => verify("TOK"), (error: Error) => {
      assert.equal(error.name, "OAuthError");
      assert.match(error.message, /not enabled in your Google Cloud project/);
      assert.match(error.message, /SAME project as the OAuth client/);
      return true;
    });

    // Current spelling: error.details[].reason
    respond('{"error":{"code":403,"details":[{"reason":"SERVICE_DISABLED"}]}}', 403);
    await assert.rejects(() => verify("TOK"), (error: Error) => {
      assert.equal(error.name, "OAuthError");
      return true;
    });

    // An unrelated 403 must NOT be relabelled — a genuine permission problem
    // deserves its own message, not advice to enable an already-enabled API.
    respond('{"error":{"code":403,"message":"denied","status":"PERMISSION_DENIED"}}', 403);
    await assert.rejects(() => verify("TOK"), (error: Error) => {
      assert.equal(error.name, "GoogleCalendarError");
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
