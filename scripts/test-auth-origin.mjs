import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const root = new URL("../", import.meta.url).href;
const authModule = new URL("../server/auth.ts", import.meta.url).href;
const authStubs = {
  "better-auth": "export const betterAuth = (options) => ({ options });",
  "better-auth/api": "export class APIError extends Error {}; export const createAuthMiddleware = (handler) => handler;",
  "@better-auth/drizzle-adapter": "export const drizzleAdapter = () => ({});",
  "./db": "export const getDb = () => ({});",
  "./workspace": "export const ensureWorkspace = async () => {};",
};
registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL?.startsWith(authModule) && Object.hasOwn(authStubs, specifier)) return nextResolve(`data:text/javascript,${encodeURIComponent(authStubs[specifier])}`, context);
  if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, root).href, context);
  if (specifier.startsWith(".") && context.parentURL?.startsWith(root) && !context.parentURL.includes("/node_modules/") && !/\.[a-z]+$/i.test(specifier)) return nextResolve(new URL(`${specifier}.ts`, context.parentURL).href, context);
  return nextResolve(specifier, context);
} });
const { resolveAuthBaseURL } = await import("../server/auth-base-url.ts");
const { requireOrigin, HttpError } = await import("../server/http.ts");
const provisioned = "https://fold.example.invalid";
const hosted = "https://fold-hosted.example.invalid";
const lookalikes = [
  `${provisioned}.attacker.invalid`, `${hosted}.attacker.invalid`,
  "https://fold-example.invalid", "https://other.apps.neander.ai",
  "https://other-uc.a.run.app", "https://attacker.invalid",
  "https://fold.example.invalid@attacker.invalid",
  "https://fold-hosted.example.invalid@attacker.invalid",
  "http://fold.example.invalid", "http://fold-hosted.example.invalid",
  `${provisioned}:444`, `${hosted}:444`,
  "https://FOLD.example.invalid", `${provisioned}/`, `${provisioned}/path`,
];
const scenarios = [
  ["exact configured origin", provisioned, provisioned],
  ["already corrected hosted origin", hosted, hosted],
  ["other configured host", "https://forms.example.invalid/auth", "https://forms.example.invalid/auth"],
  ["configured localhost", "http://localhost:4321", "http://localhost:4321"],
  ["configured loopback", "http://127.0.0.1:3000", "http://127.0.0.1:3000"],
  ...lookalikes.map((value) => [`unchanged configuration ${value}`, value, value]),
  ["missing configuration", undefined, undefined],
  ["empty configuration", "", undefined],
];

for (const mode of ["development", "test", "production"]) {
  for (const [label, configured, resolved] of scenarios) {
    test(`${mode}: ${label}, exact trust and fail-closed configuration`, async () => {
      const names = ["NODE_ENV", "BETTER_AUTH_URL", "BETTER_AUTH_SECRET"];
      const previous = names.map((name) => process.env[name]);
      try {
        process.env.NODE_ENV = mode;
        if (configured === undefined) delete process.env.BETTER_AUTH_URL;
        else process.env.BETTER_AUTH_URL = configured;
        process.env.BETTER_AUTH_SECRET = "synthetic-origin-unit-test-secret-only";
        const expected = resolved || (mode !== "production" ? "http://127.0.0.1:3000" : undefined);
        assert.equal(resolveAuthBaseURL(), expected);
        const { getAuth } = await import(`${authModule}?mode=${mode}&case=${encodeURIComponent(label)}`);
        if (expected) {
          const options = getAuth().options;
          assert.equal(options.baseURL, expected);
          assert.deepEqual(options.trustedOrigins, [new URL(expected).origin]);
          assert.doesNotThrow(() => requireOrigin(new Request(`${hosted}/api/forms`, { headers: { origin: new URL(expected).origin } })));
        } else assert.throws(getAuth, /BETTER_AUTH_URL is required/);
        const denied = new Set([undefined, "null", provisioned, hosted, "http://127.0.0.1:3000", "http://localhost:3000", ...lookalikes]);
        if (expected) denied.delete(new URL(expected).origin);
        for (const origin of denied) {
          const headers = {
            host: new URL(hosted).host,
            "x-forwarded-host": new URL(hosted).host,
            "x-forwarded-proto": "https",
            forwarded: `host=${new URL(hosted).host};proto=https`,
            referer: `${hosted}/`,
          };
          if (origin !== undefined) headers.origin = origin;
          assert.throws(() => requireOrigin(new Request(`${hosted}/api/forms`, { headers })), (error) => error instanceof HttpError && error.status === 403, `Reject ${origin} despite request URL and forwarded headers`);
        }
      } finally {
        names.forEach((name, index) => {
          if (previous[index] === undefined) delete process.env[name];
          else process.env[name] = previous[index];
        });
      }
    });
  }
}
