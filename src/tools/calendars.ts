import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleCalendarClient } from "../client.js";
import { calendarIdSchema, fail, ok, READ_ONLY } from "./util.js";

export function registerCalendarTools(server: McpServer, client: GoogleCalendarClient): void {
  server.registerTool(
    "list_calendars",
    {
      title: "List calendars",
      annotations: READ_ONLY,
      description:
        "Lists the calendars on the user's calendar list: id (use it as calendar_id in every other tool), summary, description, timeZone (IANA), accessRole (owner/writer/reader/freeBusyReader — writes need writer or owner), primary:true on the main calendar, and hidden/selected flags. The special id \"primary\" always addresses the main calendar without listing first. Paginate with page_token from nextPageToken. Calendars shared with the user but never added to their list do not appear here — address them by their explicit id.",
      inputSchema: {
        max_results: z
          .number()
          .int()
          .min(1)
          .max(250)
          .optional()
          .describe("Max calendars per page (1..250; API default 100)."),
        page_token: z.string().optional().describe("nextPageToken from the previous page."),
        min_access_role: z
          .enum(["free_busy_reader", "reader", "writer", "owner"])
          .optional()
          .describe("Only calendars where the user has at least this role (e.g. writer to find writable ones)."),
        show_hidden: z.boolean().optional().describe("Include calendars the user has hidden from their list."),
      },
    },
    async ({ max_results, page_token, min_access_role, show_hidden }) => {
      try {
        return ok(
          await client.listCalendars({
            maxResults: max_results,
            pageToken: page_token,
            minAccessRole: min_access_role,
            showHidden: show_hidden,
          }),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "get_calendar",
    {
      title: "Get a calendar",
      annotations: READ_ONLY,
      description:
        "Fetches one calendar-list entry: summary, description, timeZone (the calendar's default IANA zone — use it to interpret event times), accessRole, defaultReminders and primary. Works only for calendars on the user's list; for a shared calendar never added to the list, use raw_request with path calendar/v3/calendars/<id> instead.",
      inputSchema: { calendar_id: calendarIdSchema() },
    },
    async ({ calendar_id }) => {
      try {
        return ok(await client.getCalendar(calendar_id));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
