import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

/**
 * A `file:` dependency is invaluable while the auth component is developed
 * next door and fatal the moment it ships: npm publishes the manifest
 * verbatim, so every `npx mcp-google-calendar` would try to install a path
 * that exists on no machine but this one, and fail before the server ever
 * starts.
 *
 * Deliberately NOT part of `npm test`: while the component is developed next
 * door the `file:` range is the correct state, and a red suite during normal
 * work teaches everyone to ignore it. It is wired into `prepublishOnly`
 * instead, where a failure means exactly one thing — this release is not
 * ready. Releasing therefore has one extra step, documented in CLAUDE.md:
 * publish @a1-x-tech/mcp-google-auth first, then replace the `file:` range
 * here with the published semver.
 */
test("no local file: dependencies survive into a publishable manifest", () => {
  const ranges = {
    ...(manifest.dependencies ?? {}),
    ...(manifest.peerDependencies ?? {}),
    ...(manifest.optionalDependencies ?? {}),
  };

  const local = Object.entries(ranges)
    .filter(([, range]) => typeof range === "string" && /^(file:|link:|portal:)/.test(range))
    .map(([name, range]) => `${name}@${range}`);

  assert.deepEqual(
    local,
    [],
    `package.json still points at a local path: ${local.join(", ")}. ` +
      "Publish the dependency and replace the range with its published version before releasing.",
  );
});
