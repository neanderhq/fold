import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { validId } from "../lib/form-schema";
import { getAuth } from "./auth";
import { getDb } from "./db";
import { forms, workspaces } from "./schema";

export async function requireFormPage(id: string) {
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) redirect("/");
  if (!validId(id)) notFound();
  const [form] = await getDb().select({ id: forms.id }).from(forms)
    .innerJoin(workspaces, eq(forms.workspaceId, workspaces.id))
    .where(and(eq(forms.id, id), eq(workspaces.ownerId, session.user.id)));
  if (!form) notFound();
}
