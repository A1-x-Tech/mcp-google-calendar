import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calendarIdSchema,
  dateOnlySchema,
  DESTRUCTIVE,
  eventIdSchema,
  fail,
  ok,
  READ_ONLY,
  rfc3339Timestamp,
  UPDATE,
  WRITE,
} from "./util.js";

test("rfc3339Timestamp accepts RFC3339 timestamps and rejects bare dates/junk", () => {
  const t = rfc3339Timestamp(); // factory → fresh schema
  assert.equal(t.safeParse("2026-09-01T10:00:00Z").success, true);
  assert.equal(t.safeParse("2026-09-01T10:00:00.5+03:00").success, true);
  assert.equal(t.safeParse("2026-09-01").success, false);
  assert.equal(t.safeParse("tomorrow").success, false);
});

test("dateOnlySchema accepts calendar dates and rejects timestamps", () => {
  const d = dateOnlySchema();
  assert.equal(d.safeParse("2026-09-01").success, true);
  assert.equal(d.safeParse("2026-09-01T10:00:00Z").success, false);
  assert.equal(d.safeParse("Sept 1").success, false);
});

test("schema factories return independent schemas (no $ref dedup)", () => {
  assert.notEqual(rfc3339Timestamp(), rfc3339Timestamp());
  assert.notEqual(calendarIdSchema(), calendarIdSchema());
  assert.notEqual(eventIdSchema(), eventIdSchema());
});

test("ok emits compact JSON; fail flags isError", () => {
  assert.equal((ok({ a: 1 }).content[0] as { text: string }).text, '{"a":1}');
  const f = fail(new Error("boom"));
  assert.equal(f.isError, true);
  assert.match((f.content[0] as { text: string }).text, /boom/);
});

test("fail appends the underlying cause when present", () => {
  const err = new Error("timeout", { cause: new Error("ECONNRESET") });
  const f = fail(err);
  assert.match((f.content[0] as { text: string }).text, /timeout \(ECONNRESET\)/);
});

test("the four annotation presets set all four hints explicitly", () => {
  assert.deepEqual(READ_ONLY, {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  });
  assert.deepEqual(WRITE, {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  });
  assert.deepEqual(UPDATE, {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  });
  assert.deepEqual(DESTRUCTIVE, {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  });
});
