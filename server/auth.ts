import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { after } from "next/server.js";
import { getDb } from "./db";
import { ensureWorkspace } from "./workspace";
import { resolveAuthBaseURL } from "./auth-base-url";
import { verification } from "./auth-schema";
import { createResetSender, recoveryConfiguration, RESET_LIFETIME_SECONDS, type ResetDelivery } from "./password-recovery";
import { recoveryRateStorage } from "./recovery-rate-limit";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function createAuth(
  deliver: (message: ResetDelivery) => Promise<void> = createResetSender(),
  schedule: (task: Promise<unknown>) => void = (task) => after(() => task),
) {
  const baseURL = resolveAuthBaseURL() || required("BETTER_AUTH_URL");
  return betterAuth({
    baseURL,
    trustedOrigins: [new URL(baseURL).origin],
    secret: required("BETTER_AUTH_SECRET"),
    database: drizzleAdapter(getDb(), { provider: "pg" }),
    emailAndPassword: {
      enabled: true, minPasswordLength: 10, maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: RESET_LIFETIME_SECONDS,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, token }) => {
        const url = new URL("/reset-password", baseURL);
        url.hash = new URLSearchParams({ token }).toString();
        try { await deliver({ email: user.email, url: url.href, token }); }
        catch {
          try { await getDb().delete(verification).where(eq(verification.identifier, `reset-password:${token}`)); }
          catch {}
        }
      },
    },
    advanced: { backgroundTasks: { handler: schedule } },
    rateLimit: {
      enabled: true,
      customStorage: recoveryRateStorage,
      customRules: {
        "/request-password-reset": { window: 60, max: 3 },
        "/reset-password": { window: 60, max: 10 },
        "/**": (_request, rule) => process.env.NODE_ENV === "production" ? rule : false,
      },
    },
    hooks: { before: createAuthMiddleware(async (context) => {
      if (context.path !== "/request-password-reset" && !context.path.startsWith("/reset-password")) return;
      if ((context.path === "/request-password-reset" || context.path === "/reset-password") && context.headers?.get("origin") !== new URL(baseURL).origin) {
        throw new APIError("FORBIDDEN", { message: "Invalid origin." });
      }
      if (!recoveryConfiguration().enabled) throw new APIError("SERVICE_UNAVAILABLE", { message: "Password recovery is currently unavailable." });
      if (context.path === "/request-password-reset" && typeof context.body?.email === "string") {
        const decision = await recoveryRateStorage.consume(`recovery-email:${context.body.email.trim().toLowerCase()}`, { window: 15 * 60, max: 3 });
        if (!decision.allowed) throw new APIError("TOO_MANY_REQUESTS", { message: "Too many requests. Please try again later." });
        context.body.redirectTo = `${new URL(baseURL).origin}/reset-password`;
      }
    }) },
    account: { encryptOAuthTokens: true, accountLinking: { enabled: false } },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    databaseHooks: { user: { create: {
      before: async (owner) => {
        if (!owner.name.trim() || owner.name.length > 100) throw new APIError("BAD_REQUEST", { message: "Your name is required (maximum 100 characters)." });
        return { data: { ...owner, name: owner.name.trim() } };
      },
      after: async (owner) => { await ensureWorkspace(owner.id); },
    } } },
  });
}

let auth: ReturnType<typeof createAuth> | undefined;
export function getAuth() { return auth ??= createAuth(); }
