import { test } from "node:test";
import assert from "node:assert/strict";
import { registerAvailabilityTools } from "./availability.js";

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
    queryFreeBusy: make("queryFreeBusy"),
    createOutOfOffice: make("createOutOfOffice"),
    createFocusTime: make("createFocusTime"),
  };
  const tools: Record<string, Handler> = {};
  const server = {
    registerTool: (name: string, _cfg: unknown, handler: Handler) => {
      tools[name] = handler;
    },
  };
  registerAvailabilityTools(server as never, client as never);
  return { calls, tools };
}

test("registers the three availability tools", () => {
  const { tools } = harness();
  assert.deepEqual(Object.keys(tools).sort(), [
    "create_focus_time",
    "create_out_of_office",
    "query_free_busy",
  ]);
});

test("query_free_busy forwards the window and calendar ids normalized", async () => {
  const { calls, tools } = harness();
  await tools.query_free_busy({
    time_min: "2026-09-01T00:00:00Z",
    time_max: "2026-09-02T00:00:00Z",
    time_zone: "Europe/Berlin",
    calendar_ids: ["primary", "a@example.com"],
  });
  assert.equal(calls[0].method, "queryFreeBusy");
  assert.deepEqual(calls[0].params[0], {
    timeMin: "2026-09-01T00:00:00Z",
    timeMax: "2026-09-02T00:00:00Z",
    timeZone: "Europe/Berlin",
    calendarIds: ["primary", "a@example.com"],
  });
});

test("create_out_of_office forwards the auto-decline policy normalized", async () => {
  const { calls, tools } = harness();
  await tools.create_out_of_office({
    calendar_id: "primary",
    summary: "Vacation",
    start_date_time: "2026-09-01T00:00:00Z",
    end_date_time: "2026-09-05T00:00:00Z",
    time_zone: "Europe/Berlin",
    auto_decline: "all",
    decline_message: "Back on the 5th",
    send_updates: "all",
  });
  assert.equal(calls[0].method, "createOutOfOffice");
  assert.deepEqual(calls[0].params[0], {
    calendarId: "primary",
    summary: "Vacation",
    startDateTime: "2026-09-01T00:00:00Z",
    endDateTime: "2026-09-05T00:00:00Z",
    timeZone: "Europe/Berlin",
    autoDecline: "all",
    declineMessage: "Back on the 5th",
    sendUpdates: "all",
  });
});

test("create_focus_time forwards the chat status normalized", async () => {
  const { calls, tools } = harness();
  await tools.create_focus_time({
    calendar_id: "primary",
    start_date_time: "2026-09-01T09:00:00Z",
    end_date_time: "2026-09-01T12:00:00Z",
    auto_decline: "new",
    chat_status: "do_not_disturb",
  });
  assert.equal(calls[0].method, "createFocusTime");
  const p = calls[0].params[0] as Record<string, unknown>;
  assert.equal(p.calendarId, "primary");
  assert.equal(p.autoDecline, "new");
  assert.equal(p.chatStatus, "do_not_disturb");
});

test("a client error is returned as an isError result, not thrown", async () => {
  const { tools } = harness({ throwOn: "queryFreeBusy" });
  const res = await tools.query_free_busy({
    time_min: "2026-09-01T00:00:00Z",
    time_max: "2026-09-02T00:00:00Z",
    calendar_ids: ["primary"],
  });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /boom/);
});
