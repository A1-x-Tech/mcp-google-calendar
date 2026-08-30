import { test } from "node:test";
import assert from "node:assert/strict";
import { registerEventTools } from "./events.js";

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
    listEvents: make("listEvents"),
    getEvent: make("getEvent"),
    createEvent: make("createEvent"),
    updateEvent: make("updateEvent"),
    deleteEvent: make("deleteEvent"),
    moveEvent: make("moveEvent"),
    listEventInstances: make("listEventInstances"),
  };
  const tools: Record<string, Handler> = {};
  const server = {
    registerTool: (name: string, _cfg: unknown, handler: Handler) => {
      tools[name] = handler;
    },
  };
  registerEventTools(server as never, client as never);
  return { calls, tools };
}

test("registers the seven event tools", () => {
  const { tools } = harness();
  assert.deepEqual(Object.keys(tools).sort(), [
    "create_event",
    "delete_event",
    "get_event",
    "list_event_instances",
    "list_events",
    "move_event",
    "update_event",
  ]);
});

test("list_events maps every snake_case input to the client's normalized params", async () => {
  const { calls, tools } = harness();
  await tools.list_events({
    calendar_id: "primary",
    time_min: "2026-09-01T00:00:00Z",
    time_max: "2026-09-08T00:00:00Z",
    q: "standup",
    single_events: true,
    order_by: "start_time",
    time_zone: "Europe/Berlin",
    max_results: 20,
    page_token: "tok",
    show_deleted: true,
    updated_min: "2026-08-01T00:00:00Z",
    event_types: ["out_of_office"],
  });
  assert.equal(calls[0].method, "listEvents");
  assert.deepEqual(calls[0].params[0], {
    calendarId: "primary",
    timeMin: "2026-09-01T00:00:00Z",
    timeMax: "2026-09-08T00:00:00Z",
    q: "standup",
    singleEvents: true,
    orderBy: "start_time",
    timeZone: "Europe/Berlin",
    maxResults: 20,
    pageToken: "tok",
    showDeleted: true,
    updatedMin: "2026-08-01T00:00:00Z",
    eventTypes: ["out_of_office"],
  });
});

test("get_event passes ids and the render zone through", async () => {
  const { calls, tools } = harness();
  await tools.get_event({ calendar_id: "primary", event_id: "evt_1", time_zone: "Asia/Tokyo" });
  assert.deepEqual(calls[0], { method: "getEvent", params: ["primary", "evt_1", "Asia/Tokyo"] });
});

test("create_event forwards times, attendees, meet and notification params normalized", async () => {
  const { calls, tools } = harness();
  await tools.create_event({
    calendar_id: "primary",
    summary: "Design review",
    start_date_time: "2026-09-01T10:00:00Z",
    end_date_time: "2026-09-01T11:00:00Z",
    time_zone: "Europe/Berlin",
    attendees: [{ email: "a@example.com", optional: true }],
    recurrence: ["RRULE:FREQ=WEEKLY"],
    add_meet: true,
    send_updates: "all",
    reminders: [{ method: "popup", minutes: 10 }],
    transparency: "opaque",
    color_id: "3",
    guests_can_modify: true,
  });
  const p = calls[0].params[0] as Record<string, unknown>;
  assert.equal(calls[0].method, "createEvent");
  assert.equal(p.calendarId, "primary");
  assert.equal(p.summary, "Design review");
  assert.equal(p.startDateTime, "2026-09-01T10:00:00Z");
  assert.equal(p.endDateTime, "2026-09-01T11:00:00Z");
  assert.equal(p.timeZone, "Europe/Berlin");
  assert.deepEqual(p.attendees, [{ email: "a@example.com", optional: true }]);
  assert.deepEqual(p.recurrence, ["RRULE:FREQ=WEEKLY"]);
  assert.equal(p.addMeet, true);
  assert.equal(p.sendUpdates, "all");
  assert.deepEqual(p.reminders, [{ method: "popup", minutes: 10 }]);
  assert.equal(p.transparency, "opaque");
  assert.equal(p.colorId, "3");
  assert.equal(p.guestsCanModify, true);
});

test("update_event forwards the partial change with both ids", async () => {
  const { calls, tools } = harness();
  await tools.update_event({
    calendar_id: "primary",
    event_id: "evt_1",
    summary: "Moved",
    start_date_time: "2026-09-02T10:00:00Z",
    end_date_time: "2026-09-02T11:00:00Z",
    send_updates: "external_only",
  });
  const p = calls[0].params[0] as Record<string, unknown>;
  assert.equal(calls[0].method, "updateEvent");
  assert.equal(p.calendarId, "primary");
  assert.equal(p.eventId, "evt_1");
  assert.equal(p.summary, "Moved");
  assert.equal(p.startDateTime, "2026-09-02T10:00:00Z");
  assert.equal(p.sendUpdates, "external_only");
});

test("delete_event and move_event address the event by both ids", async () => {
  const { calls, tools } = harness();
  await tools.delete_event({ calendar_id: "primary", event_id: "evt_1", send_updates: "all" });
  assert.deepEqual(calls[0], { method: "deleteEvent", params: ["primary", "evt_1", "all"] });
  await tools.move_event({
    calendar_id: "primary",
    event_id: "evt_1",
    destination_calendar_id: "team@example.com",
    send_updates: "none",
  });
  assert.deepEqual(calls[1], { method: "moveEvent", params: ["primary", "evt_1", "team@example.com", "none"] });
});

test("list_event_instances forwards the window normalized", async () => {
  const { calls, tools } = harness();
  await tools.list_event_instances({
    calendar_id: "primary",
    event_id: "master1",
    time_min: "2026-09-01T00:00:00Z",
    time_max: "2026-10-01T00:00:00Z",
    show_deleted: true,
  });
  assert.deepEqual(calls[0].params[0], {
    calendarId: "primary",
    eventId: "master1",
    timeMin: "2026-09-01T00:00:00Z",
    timeMax: "2026-10-01T00:00:00Z",
    timeZone: undefined,
    maxResults: undefined,
    pageToken: undefined,
    showDeleted: true,
  });
});

test("the reminders schema caps overrides at 5 (the Calendar API limit)", () => {
  type Parseable = { safeParse: (value: unknown) => { success: boolean } };
  const configs: Record<string, { inputSchema: Record<string, Parseable> }> = {};
  const server = {
    registerTool: (name: string, cfg: { inputSchema: Record<string, Parseable> }) => {
      configs[name] = cfg;
    },
  };
  registerEventTools(server as never, {} as never);
  const five = Array.from({ length: 5 }, () => ({ method: "popup", minutes: 10 }));
  for (const tool of ["create_event", "update_event"]) {
    const schema = configs[tool].inputSchema.reminders;
    assert.equal(schema.safeParse(five).success, true, `${tool} must accept 5 reminders`);
    assert.equal(
      schema.safeParse([...five, { method: "email", minutes: 30 }]).success,
      false,
      `${tool} must reject a 6th reminder before it reaches the API`,
    );
  }
});

test("a client error is returned as an isError result, not thrown", async () => {
  const { tools } = harness({ throwOn: "createEvent" });
  const res = await tools.create_event({
    calendar_id: "primary",
    summary: "X",
    start_date_time: "2026-09-01T10:00:00Z",
    end_date_time: "2026-09-01T11:00:00Z",
  });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /boom/);
});
