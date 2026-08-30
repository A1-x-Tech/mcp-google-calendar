import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  OAuthError,
  registerGoogleAuth,
  TokenProvider,
  unconfiguredPrefix,
  type GoogleAuthOptions,
} from "@a1-x-tech/mcp-google-auth";
import { fetchCalendarIdentity } from "../client.js";
import { GoogleCalendarError } from "../types.js";

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
 * True when a Google API error body says the API itself is switched off in the
 * caller's Cloud project. Google reports this two ways at once and has been
 * migrating between them: the legacy `error.errors[].reason` is
 * `accessNotConfigured`, the newer `error.details[].reason` is
 * `SERVICE_DISABLED`. Either spelling means the same fix, so both are matched.
 */
function isApiDisabled(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const error = (body as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) return false;
  const reasons = new Set<unknown>();
  for (const key of ["errors", "details"] as const) {
    const list = (error as Record<string, unknown>)[key];
    if (Array.isArray(list)) {
      for (const entry of list) {
        if (typeof entry === "object" && entry !== null) {
          reasons.add((entry as { reason?: unknown }).reason);
        }
      }
    }
  }
  return reasons.has("accessNotConfigured") || reasons.has("SERVICE_DISABLED");
}

/**
 * `verifyIdentity` for the component: the plain Calendar read, plus the one
 * translation the component cannot do itself. A disabled Calendar API answers
 * the very first call with HTTP 403 — the single most likely failure right
 * after a wizard-path login — and as a bare `GoogleCalendarError` that surfaces
 * as "HTTP 403: PERMISSION_DENIED", which sends the user to check permissions
 * they cannot fix. Re-throwing it as `OAuthError("accessNotConfigured")` hands
 * finish_login the component's invariant-7 advice: enable the API in the SAME
 * project as the OAuth client. Every other failure passes through untouched.
 */
async function verifyCalendarIdentity(accessToken: string): Promise<{ email?: string }> {
  try {
    return await fetchCalendarIdentity(accessToken);
  } catch (error) {
    if (error instanceof GoogleCalendarError && error.status === 403 && isApiDisabled(error.body)) {
      throw new OAuthError("accessNotConfigured", "Google Calendar API", error.status);
    }
    throw error;
  }
}

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
  verifyIdentity: verifyCalendarIdentity,
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
