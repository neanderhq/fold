import { InputError } from "@/lib/form-schema";
import { resolveAuthBaseURL } from "./auth-base-url";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}

export async function endpoint(action: () => Promise<Response>) {
  try { return await action(); }
  catch (cause) {
    if (cause instanceof HttpError) return json({ error: cause.message }, cause.status);
    if (cause instanceof InputError) return json({ error: cause.message }, 400);
    console.error("API operation failed", cause instanceof Error ? cause.name : "Unknown error");
    return json({ error: "Unable to complete this request. Please try again." }, 500);
  }
}

export function requireOrigin(request: Request) {
  const expected = resolveAuthBaseURL();
  if (!expected || request.headers.get("origin") !== new URL(expected).origin) throw new HttpError(403, "Untrusted request origin.");
}

export async function readJson(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new HttpError(415, "Send JSON content.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "A JSON body is required.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 262144) { await reader.cancel(); throw new HttpError(413, "Request is too large."); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new HttpError(400, "Invalid JSON."); }
}
