import { test } from "node:test";
import assert from "node:assert/strict";
import { GoogleCalendarClient } from "../client.js";
import { registerRawTool } from "./raw.js";

type Args = Record<string, unknown>;
type Handler = (args: Args) => Promise<{ content: { text: string }[]; isError?: boolean }>;

/** Registers raw_request against a real client with a recording fetch stub. */
function harness() {
  const original = globalThis.fetch;
  const calls: { url: string; method: string; auth: unknown; body: unknown }[] = [];
  globalThis.fetch = (async (url: unknown, init: unknown) => {
    const i = (init ?? {}) as { method: string; headers?: Record<string, string>; body?: string };
    calls.push({
      url: String(url),
      method: i.method,
      auth: i.headers?.Authorization,
      body: i.body ? JSON.parse(i.body) : undefined,
    });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  const client = new GoogleCalendarClient({
    accessToken: "TKN",
    apiBase: "https://www.googleapis.com",
    maxRetries: 0,
  });
  const tools: Record<string, Handler> = {};
  const server = {
    registerTool: (name: string, _cfg: unknown, h: Handler) => {
      tools[name] = h;
    },
  };
  registerRawTool(server as never, client);
  return {
    tools,
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

test("raw_request defaults to GET with the Bearer token", async () => {
  const { tools, calls, restore } = harness();
  try {
    const res = await tools.raw_request({ path: "calendar/v3/colors" });
    assert.equal(res.isError, undefined);
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[0].url, "https://www.googleapis.com/calendar/v3/colors");
    assert.equal(calls[0].auth, "Bearer TKN");
    assert.equal(calls[0].body, undefined);
  } finally {
    restore();
  }
});

test("raw_request PATCHes a JSON body to a relative path with a query string", async () => {
  const { tools, calls, restore } = harness();
  try {
    await tools.raw_request({
      path: "calendar/v3/calendars/primary/events/evt_1?conferenceDataVersion=1",
      method: "PATCH",
      body: { conferenceData: null },
    });
    assert.equal(calls[0].method, "PATCH");
    assert.equal(
      calls[0].url,
      "https://www.googleapis.com/calendar/v3/calendars/primary/events/evt_1?conferenceDataVersion=1",
    );
    assert.deepEqual(calls[0].body, { conferenceData: null });
  } finally {
    restore();
  }
});

test("raw_request rejects a same-origin path outside calendar/v3/ as an isError result, without fetching", async () => {
  for (const foreign of ["drive/v3/files", "gmail/v1/users/me/messages", "calendar/v3/../../drive/v3/files"]) {
    const { tools, calls, restore } = harness();
    try {
      const res = await tools.raw_request({ path: foreign });
      assert.equal(res.isError, true, `${JSON.stringify(foreign)} should be isError`);
      assert.match(res.content[0].text, /must stay under "calendar\/v3\/"/);
      assert.equal(calls.length, 0, `must not fetch for ${JSON.stringify(foreign)}`);
    } finally {
      restore();
    }
  }
});

test("raw_request rejects an absolute path as an isError result, without fetching", async () => {
  for (const evil of ["https://evil.example/steal", "http://evil.example/x", "\\\\evil.example/x"]) {
    const { tools, calls, restore } = harness();
    try {
      const res = await tools.raw_request({ path: evil });
      assert.equal(res.isError, true, `${JSON.stringify(evil)} should be isError`);
      assert.match(res.content[0].text, /foreign origin/);
      assert.equal(calls.length, 0, `must not fetch for ${JSON.stringify(evil)}`);
    } finally {
      restore();
    }
  }
});
