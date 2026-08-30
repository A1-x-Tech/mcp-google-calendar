import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleCalendarClient } from "../client.js";
import {
  calendarIdSchema,
  dateOnlySchema,
  DESTRUCTIVE,
  eventIdSchema,
  fail,
  ok,
  READ_ONLY,
  rfc3339Timestamp,
  sendUpdatesSchema,
  timeZoneSchema,
  UPDATE,
  WRITE,
} from "./util.js";

/** Shared normalized event-content fields for create_event / update_event (fresh schemas per call). */
function eventFieldSchemas() {
  return {
    description: z.string().optional().describe("Event description (plain text or simple HTML)."),
    location: z.string().optional().describe("Free-form location, e.g. a room name or address."),
    start_date_time: rfc3339Timestamp()
      .optional()
      .describe("Timed event start, RFC3339 (e.g. 2026-09-01T10:00:00+02:00 or ...Z). Pair with end_date_time."),
    end_date_time: rfc3339Timestamp().optional().describe("Timed event end, RFC3339. Pair with start_date_time."),
    time_zone: timeZoneSchema()
      .optional()
      .describe(
        'IANA time zone for start/end (e.g. "Europe/Berlin"). REQUIRED for recurring events; otherwise optional when the RFC3339 offsets already say everything.',
      ),
    start_date: dateOnlySchema().optional().describe("All-day event start date (YYYY-MM-DD). Pair with end_date."),
    end_date: dateOnlySchema()
      .optional()
      .describe("All-day event end date, EXCLUSIVE — the day after the last day (a one-day event on the 5th ends on the 6th)."),
    attendees: z
      .array(
        z.object({
          email: z.string().min(3).describe("Attendee email address."),
          optional: z.boolean().optional().describe("Mark attendance as optional."),
        }),
      )
      .optional()
      .describe(
        "Guest list. On update this REPLACES the whole list — fetch the event first and send the complete new list. Invitation emails go out only with send_updates=all.",
      ),
    recurrence: z
      .array(z.string().min(1))
      .optional()
      .describe(
        'RRULE/RDATE/EXRULE/EXDATE lines (RFC 5545) making the event recurring, e.g. ["RRULE:FREQ=WEEKLY;BYDAY=MO,WE"]. Requires the timed pair plus time_zone.',
      ),
    add_meet: z
      .boolean()
      .optional()
      .describe(
        "Attach a Google Meet conference. The returned conferenceData may be status=pending — re-run get_event for the final Meet link.",
      ),
    send_updates: sendUpdatesSchema().optional(),
    use_default_reminders: z
      .boolean()
      .optional()
      .describe("Use the calendar's default reminders (ignored when reminders[] is given)."),
    reminders: z
      .array(
        z.object({
          method: z.enum(["email", "popup"]).describe("Reminder channel."),
          minutes: z.number().int().min(0).max(40320).describe("Minutes before the event start (0..40320 = 4 weeks)."),
        }),
      )
      .max(5, "The Calendar API allows at most 5 reminder overrides per event.")
      .optional()
      .describe("Custom reminders (max 5). Setting this turns default reminders off for the event."),
    transparency: z
      .enum(["opaque", "transparent"])
      .optional()
      .describe("opaque = the event blocks time in free/busy (default); transparent = it does not (shows as free)."),
    visibility: z
      .enum(["default", "public", "private"])
      .optional()
      .describe("Who can see event details on a shared calendar."),
    color_id: z.string().optional().describe('Event color id ("1".."11"; the palette is fixed by Google).'),
    guests_can_invite_others: z.boolean().optional().describe("Whether guests may invite more people."),
    guests_can_modify: z.boolean().optional().describe("Whether guests may edit the event."),
    guests_can_see_other_guests: z.boolean().optional().describe("Whether guests can see the guest list."),
  };
}

export function registerEventTools(server: McpServer, client: GoogleCalendarClient): void {
  server.registerTool(
    "list_events",
    {
      title: "List events",
      annotations: READ_ONLY,
      description:
        "Lists events on a calendar: id, summary, start/end (all-day events carry date with an EXCLUSIVE end; timed events carry dateTime), status, attendees with responseStatus, organizer, recurrence, hangoutLink, eventType. time_min/time_max bound the window (an event overlapping the window is included). single_events=true expands recurring events into individual instances — required for order_by=start_time and the right choice for questions like \"what is on my calendar this week\"; without it recurring events appear once as the series master. time_zone only changes how times are RENDERED in the response, never the events themselves. q searches summary/description/location/attendees. updated_min + show_deleted enable incremental polling (cancelled events come back as status=cancelled). Paginate with page_token from nextPageToken.",
      inputSchema: {
        calendar_id: calendarIdSchema(),
        time_min: rfc3339Timestamp()
          .optional()
          .describe("Only events ending at/after this RFC3339 moment (window lower bound)."),
        time_max: rfc3339Timestamp()
          .optional()
          .describe("Only events starting before this RFC3339 moment (window upper bound, exclusive)."),
        q: z.string().optional().describe("Free-text search over summary, description, location and attendees."),
        single_events: z
          .boolean()
          .optional()
          .describe("Expand recurring events into instances (required for order_by=start_time)."),
        order_by: z
          .enum(["start_time", "updated"])
          .optional()
          .describe("Sort order; start_time works only with single_events=true. Default is unspecified order."),
        time_zone: timeZoneSchema()
          .optional()
          .describe("IANA zone the response times are rendered in (defaults to the calendar's zone)."),
        max_results: z
          .number()
          .int()
          .min(1)
          .max(2500)
          .optional()
          .describe("Max events per page (1..2500; API default 250)."),
        page_token: z.string().optional().describe("nextPageToken from the previous page."),
        show_deleted: z.boolean().optional().describe("Include cancelled events (status=cancelled)."),
        updated_min: rfc3339Timestamp()
          .optional()
          .describe("Only events modified after this RFC3339 moment — for incremental polling; too-old values return HTTP 410."),
        event_types: z
          .array(z.enum(["default", "out_of_office", "focus_time", "working_location", "birthday"]))
          .optional()
          .describe("Only these event types (e.g. [\"out_of_office\"] to see OOO blocks)."),
      },
    },
    async (args) => {
      try {
        return ok(
          await client.listEvents({
            calendarId: args.calendar_id,
            timeMin: args.time_min,
            timeMax: args.time_max,
            q: args.q,
            singleEvents: args.single_events,
            orderBy: args.order_by,
            timeZone: args.time_zone,
            maxResults: args.max_results,
            pageToken: args.page_token,
            showDeleted: args.show_deleted,
            updatedMin: args.updated_min,
            eventTypes: args.event_types,
          }),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "get_event",
    {
      title: "Get an event",
      annotations: READ_ONLY,
      description:
        "Fetches one event by id: summary, description, location, start/end, attendees with their responseStatus (accepted/declined/tentative/needsAction), organizer, recurrence rules, recurringEventId (present on instances of a series), conferenceData/hangoutLink (Google Meet), reminders, visibility, transparency and eventType. Works for a series master and for an individual instance id alike.",
      inputSchema: {
        calendar_id: calendarIdSchema(),
        event_id: eventIdSchema(),
        time_zone: timeZoneSchema().optional().describe("IANA zone the response times are rendered in."),
      },
    },
    async ({ calendar_id, event_id, time_zone }) => {
      try {
        return ok(await client.getEvent(calendar_id, event_id, time_zone));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "create_event",
    {
      title: "Create an event",
      annotations: WRITE,
      description:
        "Creates an event and returns it (id, htmlLink, start/end, attendees, hangoutLink when add_meet). Times: EITHER start_date_time + end_date_time (RFC3339; add time_zone for recurring events) OR start_date + end_date for all-day (end_date is EXCLUSIVE — the day after the last day). recurrence makes it a recurring series. attendees invites guests — but the API sends invitation emails ONLY with send_updates=all (the default notifies nobody). add_meet attaches a Google Meet link (may come back status=pending — re-run get_event for the final URL). This is a plain calendar write: it does not check for conflicts — call query_free_busy first to find a free slot. Never blindly re-send after a timeout or 5xx: the event may already exist — check with list_events first, or you will create a duplicate and re-invite everyone.",
      inputSchema: {
        calendar_id: calendarIdSchema(),
        summary: z.string().min(1).describe("Event title."),
        ...eventFieldSchemas(),
      },
    },
    async (args) => {
      try {
        return ok(
          await client.createEvent({
            calendarId: args.calendar_id,
            summary: args.summary,
            description: args.description,
            location: args.location,
            startDate: args.start_date,
            endDate: args.end_date,
            startDateTime: args.start_date_time,
            endDateTime: args.end_date_time,
            timeZone: args.time_zone,
            attendees: args.attendees,
            recurrence: args.recurrence,
            addMeet: args.add_meet,
            sendUpdates: args.send_updates,
            useDefaultReminders: args.use_default_reminders,
            reminders: args.reminders,
            transparency: args.transparency,
            visibility: args.visibility,
            colorId: args.color_id,
            guestsCanInviteOthers: args.guests_can_invite_others,
            guestsCanModify: args.guests_can_modify,
            guestsCanSeeOtherGuests: args.guests_can_see_other_guests,
          }),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "update_event",
    {
      title: "Update an event",
      annotations: UPDATE,
      description:
        "Partially updates an event (PATCH): only the provided fields change, but a provided nested object REPLACES its predecessor wholesale — attendees replaces the entire guest list (get_event first, send the complete new list), reminders replaces all overrides, and a time change should carry BOTH the new start and end (start_date_time + end_date_time, or start_date + end_date). To reschedule one occurrence of a recurring series, pass that instance's id (from list_event_instances) as event_id; passing the series master id changes every occurrence. Guests hear about the change only with send_updates=all. Also works to update Out of Office / Focus Time blocks. Returns the updated event.",
      inputSchema: {
        calendar_id: calendarIdSchema(),
        event_id: eventIdSchema(),
        summary: z.string().min(1).optional().describe("New event title."),
        ...eventFieldSchemas(),
      },
    },
    async (args) => {
      try {
        return ok(
          await client.updateEvent({
            calendarId: args.calendar_id,
            eventId: args.event_id,
            summary: args.summary,
            description: args.description,
            location: args.location,
            startDate: args.start_date,
            endDate: args.end_date,
            startDateTime: args.start_date_time,
            endDateTime: args.end_date_time,
            timeZone: args.time_zone,
            attendees: args.attendees,
            recurrence: args.recurrence,
            addMeet: args.add_meet,
            sendUpdates: args.send_updates,
            useDefaultReminders: args.use_default_reminders,
            reminders: args.reminders,
            transparency: args.transparency,
            visibility: args.visibility,
            colorId: args.color_id,
            guestsCanInviteOthers: args.guests_can_invite_others,
            guestsCanModify: args.guests_can_modify,
            guestsCanSeeOtherGuests: args.guests_can_see_other_guests,
          }),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "delete_event",
    {
      title: "Delete an event",
      annotations: DESTRUCTIVE,
      description:
        "Deletes (cancels) an event — there is no undelete. Deleting a series master id cancels the ENTIRE recurring series; deleting one instance id (from list_event_instances) cancels only that occurrence. On an event with guests this cancels the meeting for everyone, but cancellation emails go out only with send_updates=all. Returns {deleted:true}.",
      inputSchema: {
        calendar_id: calendarIdSchema(),
        event_id: eventIdSchema(),
        send_updates: sendUpdatesSchema().optional(),
      },
    },
    async ({ calendar_id, event_id, send_updates }) => {
      try {
        return ok(await client.deleteEvent(calendar_id, event_id, send_updates));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "move_event",
    {
      title: "Move an event to another calendar",
      annotations: UPDATE,
      description:
        "Moves an event to a different calendar (changes its organizer calendar; the event id stays the same). Rescheduling to another TIME is update_event, not this. Only regular events can move — Out of Office, Focus Time, working-location and birthday events cannot, and events with attendees can be moved only by their organizer. Needs writer access to both calendars. send_updates=all notifies the guests.",
      inputSchema: {
        calendar_id: calendarIdSchema(),
        event_id: eventIdSchema(),
        destination_calendar_id: z
          .string()
          .min(1)
          .describe("The calendar id the event moves to (from list_calendars)."),
        send_updates: sendUpdatesSchema().optional(),
      },
    },
    async ({ calendar_id, event_id, destination_calendar_id, send_updates }) => {
      try {
        return ok(await client.moveEvent(calendar_id, event_id, destination_calendar_id, send_updates));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "list_event_instances",
    {
      title: "List instances of a recurring event",
      annotations: READ_ONLY,
      description:
        "Expands one recurring event (the series master id) into its individual instances, each with its own id (like masterId_20260901T100000Z) and concrete start/end. Use an instance id with update_event to reschedule a single occurrence, or with delete_event to cancel just that one; exceptions already made to the series show their changed times here. show_deleted=true includes cancelled occurrences. Bound the window with time_min/time_max — an unbounded infinite series is paginated via page_token.",
      inputSchema: {
        calendar_id: calendarIdSchema(),
        event_id: eventIdSchema().describe("The recurring series master id (from list_events without single_events)."),
        time_min: rfc3339Timestamp().optional().describe("Only instances ending at/after this RFC3339 moment."),
        time_max: rfc3339Timestamp().optional().describe("Only instances starting before this RFC3339 moment."),
        time_zone: timeZoneSchema().optional().describe("IANA zone the response times are rendered in."),
        max_results: z.number().int().min(1).max(2500).optional().describe("Max instances per page (1..2500)."),
        page_token: z.string().optional().describe("nextPageToken from the previous page."),
        show_deleted: z.boolean().optional().describe("Include cancelled instances (status=cancelled)."),
      },
    },
    async (args) => {
      try {
        return ok(
          await client.listEventInstances({
            calendarId: args.calendar_id,
            eventId: args.event_id,
            timeMin: args.time_min,
            timeMax: args.time_max,
            timeZone: args.time_zone,
            maxResults: args.max_results,
            pageToken: args.page_token,
            showDeleted: args.show_deleted,
          }),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );
}
