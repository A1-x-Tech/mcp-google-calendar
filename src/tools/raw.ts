import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleCalendarClient, HttpMethod } from "../client.js";
import { DESTRUCTIVE, fail, ok } from "./util.js";

export function registerRawTool(server: McpServer, client: GoogleCalendarClient): void {
  server.registerTool(
    "raw_request",
    {
      title: "Raw Google Calendar API call",
      // Full API surface incl. full-event PUT and deletes — annotate for the
      // worst case a call can do, not the average.
      annotations: DESTRUCTIVE,
      description:
        'Escape hatch to call any Google Calendar API v3 path directly, for requests the typed tools don\'t cover — e.g. events.quickAdd ("calendar/v3/calendars/primary/events/quickAdd?text=Lunch tomorrow noon", POST), the colors palette ("calendar/v3/colors"), ACL rules, secondary-calendar creation ("calendar/v3/calendars", POST), removing a Meet conference (PATCH with {"conferenceData":null} and ?conferenceDataVersion=1), watch channels, or an event PUT that replaces every field. The path is relative to https://www.googleapis.com, must stay under calendar/v3/ (other Google APIs on this host — drive/v3, gmail/v1, ... — are rejected before any request is sent) and may carry a query string. The Bearer token is added automatically; the method defaults to GET. Remember: PUT replaces unspecified fields with defaults — prefer PATCH semantics via update_event when possible.',
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe(
            'API path relative to https://www.googleapis.com, starting with "calendar/v3/", e.g. "calendar/v3/calendars/primary/events".',
          ),
        method: z
          .enum(["GET", "POST", "PUT", "PATCH", "DELETE"])
          .optional()
          .describe("HTTP method. Defaults to GET."),
        body: z.record(z.any()).optional().describe("JSON request body (POST/PUT/PATCH only)."),
      },
    },
    async ({ path, method, body }) => {
      try {
        const m = (method ?? "GET") as HttpMethod;
        return ok(await client.request(m, path, body));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
