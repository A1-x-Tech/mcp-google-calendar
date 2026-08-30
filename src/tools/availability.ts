import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleCalendarClient } from "../client.js";
import {
  calendarIdSchema,
  fail,
  ok,
  READ_ONLY,
  rfc3339Timestamp,
  sendUpdatesSchema,
  timeZoneSchema,
  WRITE,
} from "./util.js";

/** Shared inputs of the two availability-block tools (fresh schemas per call). */
function blockSchemas() {
  return {
    calendar_id: calendarIdSchema().default("primary"),
    start_date_time: rfc3339Timestamp().describe("Block start, RFC3339 (these blocks are always timed, never all-day)."),
    end_date_time: rfc3339Timestamp().describe("Block end, RFC3339."),
    time_zone: timeZoneSchema().optional(),
    auto_decline: z
      .enum(["none", "all", "new"])
      .optional()
      .describe(
        "Which conflicting meeting invitations Calendar auto-declines: none, all overlapping ones, or only new ones arriving after the block is created (existing meetings survive).",
      ),
    decline_message: z.string().optional().describe("Message sent with each auto-declined invitation."),
    send_updates: sendUpdatesSchema().optional(),
  };
}

export function registerAvailabilityTools(server: McpServer, client: GoogleCalendarClient): void {
  server.registerTool(
    "query_free_busy",
    {
      title: "Query free/busy times",
      annotations: READ_ONLY,
      description:
        "Returns the busy intervals of up to 50 calendars in one time window — the way to find a common free slot before create_event. Input calendar ids (or attendee email addresses, which double as their primary-calendar ids — subject to their sharing settings). The response maps each calendar id to busy:[{start,end}] ranges; gaps between them are free. Only busy blocks come back — never event titles or details — and events marked transparent (free) don't appear. A calendar the user cannot read shows up under errors, not busy. This is a pure read despite being an HTTP POST.",
      inputSchema: {
        time_min: rfc3339Timestamp().describe("Window start, RFC3339."),
        time_max: rfc3339Timestamp().describe("Window end, RFC3339."),
        time_zone: timeZoneSchema().optional().describe("IANA zone the busy times are rendered in (default UTC)."),
        calendar_ids: z
          .array(z.string().min(1))
          .min(1)
          .max(50)
          .describe('Calendar ids to check (1..50) — "primary", calendar ids from list_calendars, or attendee emails.'),
      },
    },
    async ({ time_min, time_max, time_zone, calendar_ids }) => {
      try {
        return ok(
          await client.queryFreeBusy({
            timeMin: time_min,
            timeMax: time_max,
            timeZone: time_zone,
            calendarIds: calendar_ids,
          }),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "create_out_of_office",
    {
      title: "Create an Out of Office block",
      annotations: WRITE,
      description:
        "Creates an Out of Office event that can auto-decline meeting invitations while it lasts (auto_decline: all overlapping meetings, or only new invitations; decline_message customizes the reply). ONLY works on the PRIMARY calendar of a Google Workspace account — consumer Gmail and secondary calendars get HTTP 400. Always timed (start/end date_time), never all-day. Manage it afterwards like any event: update_event to change it, delete_event to remove it, list_events with event_types=[\"out_of_office\"] to find existing blocks. Not retried after an ambiguous failure — check list_events before re-sending.",
      inputSchema: {
        summary: z.string().optional().describe('Title (defaults to "Out of office").'),
        ...blockSchemas(),
      },
    },
    async (args) => {
      try {
        return ok(
          await client.createOutOfOffice({
            calendarId: args.calendar_id,
            summary: args.summary,
            startDateTime: args.start_date_time,
            endDateTime: args.end_date_time,
            timeZone: args.time_zone,
            autoDecline: args.auto_decline,
            declineMessage: args.decline_message,
            sendUpdates: args.send_updates,
          }),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "create_focus_time",
    {
      title: "Create a Focus Time block",
      annotations: WRITE,
      description:
        "Creates a Focus Time event: blocks the slot, can auto-decline conflicting invitations (auto_decline + decline_message) and can flip Google Chat to Do Not Disturb (chat_status). ONLY works on the PRIMARY calendar of a Google Workspace account — consumer Gmail and secondary calendars get HTTP 400. Always timed (start/end date_time), never all-day. Manage it afterwards like any event: update_event / delete_event, and list_events with event_types=[\"focus_time\"] to find existing blocks. Not retried after an ambiguous failure — check list_events before re-sending.",
      inputSchema: {
        summary: z.string().optional().describe('Title (defaults to "Focus time").'),
        chat_status: z
          .enum(["available", "do_not_disturb"])
          .optional()
          .describe("Google Chat presence during the block."),
        ...blockSchemas(),
      },
    },
    async (args) => {
      try {
        return ok(
          await client.createFocusTime({
            calendarId: args.calendar_id,
            summary: args.summary,
            startDateTime: args.start_date_time,
            endDateTime: args.end_date_time,
            timeZone: args.time_zone,
            autoDecline: args.auto_decline,
            declineMessage: args.decline_message,
            chatStatus: args.chat_status,
            sendUpdates: args.send_updates,
          }),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );
}
