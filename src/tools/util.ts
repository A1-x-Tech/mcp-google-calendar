import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

/**
 * Schema factories, not shared consts: reusing one zod object across two fields
 * makes zod-to-json-schema dedupe them into a `$ref`, which some tool-schema
 * consumers (OpenAI Apps review) don't dereference and flag as `any`. A fresh
 * object per field keeps each one inlined with its type + pattern.
 */
export const calendarIdSchema = () =>
  z
    .string()
    .min(1)
    .describe(
      'The calendar id from list_calendars, or "primary" for the authenticated user\'s main calendar.',
    );

/** The event id from list_events/get_event output (also accepts a recurring-instance id). */
export const eventIdSchema = () =>
  z
    .string()
    .min(1)
    .describe(
      "The event id from list_events or create_event output. A recurring-instance id (masterId_20260101T100000Z from list_event_instances) addresses one occurrence.",
    );

/** An RFC3339 timestamp, e.g. 2026-09-01T10:00:00Z or 2026-09-01T10:00:00+03:00. */
export const rfc3339Timestamp = () =>
  z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
      "Must be an RFC3339 timestamp, e.g. 2026-09-01T10:00:00Z or 2026-09-01T10:00:00+03:00",
    );

/** A calendar date (all-day events), e.g. 2026-09-01. */
export const dateOnlySchema = () =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be a calendar date, e.g. 2026-09-01");

/** An IANA time zone name, e.g. Europe/Berlin or America/New_York. */
export const timeZoneSchema = () =>
  z.string().min(1).describe('IANA time zone name, e.g. "Europe/Berlin" or "America/New_York".');

/** Who is emailed about an event write. The API notifies NOBODY unless this is set. */
export const sendUpdatesSchema = () =>
  z
    .enum(["all", "external_only", "none"])
    .describe(
      "Who receives an email about this change: all guests, only guests outside your organization, or nobody. Defaults to none — attendees are NOT notified unless you pass all.",
    );

/** Wraps a value as a compact-JSON tool result (compact: the consumer is an LLM). */
export function ok(data: unknown): CallToolResult {
  const text = typeof data === "string" ? data : JSON.stringify(data);
  return { content: [{ type: "text", text: text ?? "null" }] };
}

export function fail(err: unknown): CallToolResult {
  let message = err instanceof Error ? err.message : String(err);
  // Surface the underlying cause (e.g. the network error behind a timeout) — no
  // secrets live in cause, and it makes failures far easier to diagnose.
  if (err instanceof Error && err.cause instanceof Error) message += ` (${err.cause.message})`;
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

/**
 * MCP tool annotations — hints the consuming client can use to gate or label a
 * tool. All four hints are set explicitly on every tool: some clients (OpenAI
 * Apps review) require readOnlyHint, destructiveHint and openWorldHint on each.
 *
 * The Calendar API mixes reads and writes, so each tool picks one of four
 * presets: READ_ONLY (pure reads), WRITE (creates new state; replaying
 * duplicates it), UPDATE (overwrites existing fields; replaying the same
 * update converges) and DESTRUCTIVE (removes existing state; replaying hits
 * different targets).
 */
export const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const;

export const UPDATE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export const DESTRUCTIVE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
} as const;
