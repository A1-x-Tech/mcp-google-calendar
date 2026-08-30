import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerGoogleAuth,
  TokenProvider,
  unconfiguredPrefix,
  type GoogleAuthOptions,
} from "@a1-x-tech/mcp-google-auth";
import { fetchCalendarIdentity } from "../client.js";

/**
 * The minimal scopes this server needs (see docs/TOOLS.md): calendar.events
 * for event reads/writes incl. Out of Office / Focus Time, calendar.readonly
 * for the calendar list and free/busy. The component adds the identity scopes
 * (openid + userinfo.email) on top of these for every login.
 */
export const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
];

/**
 * The single source of the auth wiring: serverName "calendar" puts the stored
 * login in ~/.config/mcp-google-calendar/credentials.json (the component
 * prefixes "mcp-google-"), envPrefix keeps the provider reading the exact
 * GOOGLE_CALENDAR_* variables config.ts documents — which is what preserves
 * the env-beats-stored priority for existing installs. verifyIdentity checks
 * a fresh login against the Calendar API itself, so finish_login also proves
 * the API is enabled in the user's Google Cloud project.
 */
export const AUTH_OPTIONS: GoogleAuthOptions = {
  serverName: "calendar",
  envPrefix: "GOOGLE_CALENDAR",
  scopes: CALENDAR_SCOPES,
  verifyIdentity: fetchCalendarIdentity,
};

/**
 * Registers the six onboarding tools (auth_status, setup_instructions,
 * set_client, start_login, finish_login, logout) and returns the
 * TokenProvider the GoogleCalendarClient plugs in as its fallback token
 * source — the same instance, so a login finished mid-session is visible to
 * the very next API call without a restart.
 */
export function registerAuthTools(server: McpServer): TokenProvider {
  return registerGoogleAuth(server, AUTH_OPTIONS);
}

/** True when any token exists — env variables or a stored in-chat login. */
export function hasAuthToken(): boolean {
  return new TokenProvider(AUTH_OPTIONS).hasToken();
}

/** The "NOT CONNECTED" prefix for the initialize instructions (names both fixes). */
export function authUnconfiguredPrefix(): string {
  return unconfiguredPrefix(AUTH_OPTIONS);
}
