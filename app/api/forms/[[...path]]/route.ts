import { formsApi } from "@/server/forms-api";

type Context = { params: Promise<{ path?: string[] }> };

async function handle(request: Request, context: Context) {
  return formsApi(request, (await context.params).path ?? []);
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
