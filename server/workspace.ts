import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { workspaces } from "./schema";

export async function ensureWorkspace(ownerId: string) {
  await getDb().insert(workspaces).values({ ownerId }).onConflictDoNothing({ target: workspaces.ownerId });
  const [workspace] = await getDb().select().from(workspaces).where(eq(workspaces.ownerId, ownerId));
  return workspace;
}
