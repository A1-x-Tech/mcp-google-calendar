import { test } from "node:test";
import assert from "node:assert/strict";
import { registerCalendarTools } from "./calendars.js";
import { registerEventTools } from "./events.js";
import { registerAvailabilityTools } from "./availability.js";
import { registerRawTool } from "./raw.js";
import { registerAuthTools } from "./auth.js";
import { DESTRUCTIVE, READ_ONLY, UPDATE, WRITE } from "./util.js";

interface Annotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/** Registers every tool against a fake server, capturing each tool's annotations. */
function collectAnnotations(): Record<string, Annotations | undefined> {
  const annotations: Record<string, Annotations | undefined> = {};
  const server = {
    registerTool: (name: string, cfg: { annotations?: Annotations }) => {
      annotations[name] = cfg.annotations;
    },
  };
  // Registration reads the client only inside handlers, so a stub is fine here.
  registerCalendarTools(server as never, {} as never);
  registerEventTools(server as never, {} as never);
  registerAvailabilityTools(server as never, {} as never);
  registerRawTool(server as never, {} as never);
  registerAuthTools(server as never);
  return annotations;
}

const ANN = collectAnnotations();

/**
 * The onboarding tools come from @a1-x-tech/mcp-google-auth, whose mutating
 * preset (idempotentHint: true) differs from this server's WRITE — pinned here
 * literally so a drift in the component surfaces as a conscious decision.
 */
const AUTH_WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;
const AUTH_DESTRUCTIVE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
} as const;

/**
 * The Calendar API mixes reads and writes, so instead of one blanket invariant
 * the expected hints are pinned per tool. Changing a tool's annotation must be
 * a conscious decision that updates this map.
 */
const EXPECTED: Record<string, Annotations> = {
  list_calendars: READ_ONLY,
  get_calendar: READ_ONLY,
  list_events: READ_ONLY,
  get_event: READ_ONLY,
  create_event: WRITE,
  update_event: UPDATE,
  delete_event: DESTRUCTIVE,
  move_event: UPDATE,
  list_event_instances: READ_ONLY,
  query_free_busy: READ_ONLY,
  create_out_of_office: WRITE,
  create_focus_time: WRITE,
  raw_request: DESTRUCTIVE,
  // In-chat login (@a1-x-tech/mcp-google-auth):
  auth_status: READ_ONLY,
  setup_instructions: READ_ONLY,
  set_client: AUTH_WRITE,
  start_login: AUTH_WRITE, // deliberately NOT read-only — see the dedicated test
  finish_login: AUTH_WRITE,
  logout: AUTH_DESTRUCTIVE,
};

test("registers all nineteen tools with annotations", () => {
  assert.deepEqual(Object.keys(ANN).sort(), Object.keys(EXPECTED).sort());
  for (const [name, a] of Object.entries(ANN)) {
    assert.ok(a, `${name} is missing annotations`);
  }
});

test("every tool carries exactly its pinned hints (all four set)", () => {
  for (const [name, expected] of Object.entries(EXPECTED)) {
    assert.deepEqual(ANN[name], expected, `${name} annotations drifted`);
  }
});

test("free/busy stays read-only — a POST on the wire, a pure read in effect", () => {
  assert.equal(ANN.query_free_busy?.readOnlyHint, true, "query_free_busy must be read-only");
});

test("every mutating tool is flagged non-read-only", () => {
  for (const name of [
    "create_event",
    "update_event",
    "delete_event",
    "move_event",
    "create_out_of_office",
    "create_focus_time",
    "raw_request",
    "set_client",
    "start_login",
    "finish_login",
    "logout",
  ]) {
    assert.equal(ANN[name]?.readOnlyHint, false, `${name} must not claim read-only`);
  }
});

// A READ_ONLY hint would let an AI client run start_login without user
// confirmation — i.e. a prompt injection could silently initiate an OAuth
// flow. The component pins this too; this test keeps the host honest if it
// ever wraps or overrides the registration.
test("start_login is deliberately NOT read-only", () => {
  assert.equal(ANN.start_login?.readOnlyHint, false, "start_login must never claim read-only");
});
