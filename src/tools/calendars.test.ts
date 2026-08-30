import { test } from "node:test";
import assert from "node:assert/strict";
import { registerCalendarTools } from "./calendars.js";

type Args = Record<string, unknown>;
type Handler = (args: Args) => Promise<{ content: { text: string }[]; isError?: boolean }>;

/** Fake server + fake client so the tool handlers run without network. */
function harness(opts: { throwOn?: string } = {}) {
  const calls: { method: string; params: unknown[] }[] = [];
  const make =
    (method: string) =>
    async (...params: unknown[]) => {
      calls.push({ method, params });
      if (opts.throwOn === method) throw new Error("boom");
      return { ok: true };
    };
  const client = {
    listCalendars: make("listCalendars"),
    getCalendar: make("getCalendar"),
  };
  const tools: Record<string, Handler> = {};
  const server = {
    registerTool: (name: string, _cfg: unknown, handler: Handler) => {
      tools[name] = handler;
    },
  };
  registerCalendarTools(server as never, client as never);
  return { calls, tools };
}

test("registers the two calendar tools", () => {
  const { tools } = harness();
  assert.deepEqual(Object.keys(tools).sort(), ["get_calendar", "list_calendars"]);
});

test("list_calendars forwards the normalized paging and filter params", async () => {
  const { calls, tools } = harness();
  await tools.list_calendars({
    max_results: 50,
    page_token: "tok",
    min_access_role: "writer",
    show_hidden: true,
  });
  assert.equal(calls[0].method, "listCalendars");
  assert.deepEqual(calls[0].params[0], {
    maxResults: 50,
    pageToken: "tok",
    minAccessRole: "writer",
    showHidden: true,
  });
});

test("get_calendar passes the calendar id through", async () => {
  const { calls, tools } = harness();
  await tools.get_calendar({ calendar_id: "primary" });
  assert.deepEqual(calls[0], { method: "getCalendar", params: ["primary"] });
});

test("a client error is returned as an isError result, not thrown", async () => {
  const { tools } = harness({ throwOn: "listCalendars" });
  const res = await tools.list_calendars({});
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /boom/);
});
