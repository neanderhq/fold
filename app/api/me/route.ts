import { requireOwner } from "@/server/owner";
import { endpoint, json } from "@/server/http";

export function GET(request: Request) {
  return endpoint(async () => json({ user: await requireOwner(request) }));
}
