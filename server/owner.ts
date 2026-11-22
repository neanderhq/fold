import { getAuth } from "./auth";
import { HttpError } from "./http";

export { ensureWorkspace } from "./workspace";

export async function requireOwner(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) throw new HttpError(401, "Please log in to your workspace.");
  return session.user;
}
