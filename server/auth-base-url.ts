export function resolveAuthBaseURL() {
  return process.env.BETTER_AUTH_URL || (process.env.NODE_ENV !== "production" ? "http://127.0.0.1:3000" : undefined);
}
