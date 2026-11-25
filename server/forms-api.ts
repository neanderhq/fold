import { and, count, desc, eq, gte, lt, sql } from "drizzle-orm";
import { isRecord, parseSchema, validId } from "@/lib/form-schema";
import { responseCsv } from "@/lib/response-csv";
import { starterDraft } from "@/lib/form-starters";
import { deliverySettingsApi } from "./delivery-settings";
import { responseSummaries } from "./response-summary";
import { getDb } from "./db";
import { forms, responses } from "./schema";
import { ensureWorkspace, requireOwner } from "./owner";
import { endpoint, HttpError, json, readJson, requireOrigin } from "./http";

function responseFilters(url: URL) {
  const conditions = [];
  const query = url.searchParams.get("q") ?? "";
  if (query.length > 200) throw new HttpError(400, "Search is too long.");
  if (query) {
    const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(sql`(${responses.answers}::text ilike ${pattern} or ${responses.schemaSnapshot}::text ilike ${pattern})`);
  }
  for (const name of ["from", "to"] as const) {
    const value = url.searchParams.get(name);
    if (!value) continue;
    const parsed = new Date(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new HttpError(400, "Use valid YYYY-MM-DD dates.");
    conditions.push(name === "from" ? gte(responses.createdAt, parsed) : lt(responses.createdAt, new Date(parsed.getTime() + 86400000)));
  }
  if (url.searchParams.get("from") && url.searchParams.get("to") && url.searchParams.get("from")! > url.searchParams.get("to")!) throw new HttpError(400, "Start date must not follow end date.");
  return conditions;
}

export function formsApi(request: Request, path: string[]) {
  return endpoint(async () => {
    const owner = await requireOwner(request);
    if (request.method !== "GET") requireOrigin(request);
    const workspace = await ensureWorkspace(owner.id);
    const db = getDb();
    if (path.length === 0) {
      if (request.method === "GET") {
        const records = await db.select({ form: forms, responseCount: count(responses.id) }).from(forms).leftJoin(responses, eq(responses.formId, forms.id)).where(eq(forms.workspaceId, workspace.id)).groupBy(forms.id).orderBy(desc(forms.updatedAt));
        return json(records.map(({ form, responseCount }) => ({ ...form, responseCount })));
      }
      if (request.method !== "POST") throw new HttpError(405, "Method not allowed.");
      const body = await readJson(request);
      if (!isRecord(body) || Object.keys(body).some(key => key !== "starter") || (body.starter !== undefined && typeof body.starter !== "string")) throw new HttpError(400, "Supply only a starter form name.");
      const [form] = await db.insert(forms).values({ workspaceId: workspace.id, draft: starterDraft(body.starter as string | undefined) }).returning();
      return json(form, 201);
    }
    const [formId, action, responseId] = path;
    if (!validId(formId)) throw new HttpError(404, "Form not found.");
    if (action === "integrations" && path.length === 2) return deliverySettingsApi(request, owner, workspace.id, formId);
    const owned = and(eq(forms.id, formId), eq(forms.workspaceId, workspace.id));
    if (request.method === "GET") {
      const [form] = await db.select().from(forms).where(owned);
      if (!form) throw new HttpError(404, "Form not found.");
      if (path.length === 1) return json(form);
      if (action === "summary" && path.length === 2) return json(await responseSummaries(db, and(eq(responses.formId, formId), ...responseFilters(new URL(request.url)))));
      if ((action === "responses" && path.length <= 3) || (action === "export" && path.length === 2)) {
        if (responseId && !validId(responseId)) throw new HttpError(404, "Response not found.");
        const url = new URL(request.url);
        const filters = and(eq(responses.formId, formId), ...(responseId ? [eq(responses.id, responseId)] : responseFilters(url)));
        if (responseId) {
          const [record] = await db.select().from(responses).where(filters);
          if (!record) throw new HttpError(404, "Response not found.");
          return json(record);
        }
        if (action === "export") {
          const records = await db.select().from(responses).where(filters).orderBy(desc(responses.createdAt), desc(responses.id)).limit(10001);
          if (records.length > 10000) throw new HttpError(400, "Narrow the date range to export at most 10,000 responses.");
          const csv = responseCsv(records.map((record) => ({ ...record, createdAt: record.createdAt.toISOString() })));
          return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="fold-${formId}.csv"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
        }
        const paged = url.searchParams.has("page");
        const page = Number(url.searchParams.get("page") ?? 1);
        if (!Number.isInteger(page) || page < 1 || page > 1000000) throw new HttpError(400, "Invalid page.");
        const records = await db.select().from(responses).where(filters).orderBy(desc(responses.createdAt), desc(responses.id)).limit(paged ? 20 : 1000).offset(paged ? (page - 1) * 20 : 0);
        if (!paged) return json(records);
        const [total] = await db.select({ count: count() }).from(responses).where(filters);
        return json({ records, total: total.count, page, pageSize: 20 });
      }
      throw new HttpError(404, "Not found.");
    }
    const saving = path.length === 1 && request.method === "PATCH";
    const operation = path.length === 2 && request.method === "POST" && ["publish", "unpublish", "duplicate", "archive", "restore", "rename"].includes(action);
    if (!saving && !operation) throw new HttpError(405, "Method not allowed.");
    const body = await readJson(request);
    return db.transaction(async (transaction) => {
      const [form] = await transaction.select().from(forms).where(owned).for("update");
      if (!form) throw new HttpError(404, "Form not found.");
      if (!saving && action !== "rename" && (!isRecord(body) || Object.keys(body).length)) throw new HttpError(400, "No fields are accepted for this operation.");
      if (action === "duplicate") {
        const [copy] = await transaction.insert(forms).values({ workspaceId: workspace.id, draft: { ...form.draft, title: `${form.draft.title.slice(0, 190)} (copy)` } }).returning();
        return json(copy, 201);
      }
      if (action === "publish" && form.archived) throw new HttpError(409, "Restore this form before publishing.");
      let update: Partial<typeof forms.$inferInsert>;
      if (saving) update = { draft: parseSchema(body, form.draft.question?.id) };
      else if (action === "rename") {
        if (!isRecord(body) || Object.keys(body).some((key) => key !== "title")) throw new HttpError(400, "Supply only a title.");
        update = { draft: parseSchema({ ...form.draft, title: body.title }) };
      } else if (action === "publish") update = { published: parseSchema(form.draft), isPublished: true };
      else if (action === "archive") update = { archived: true, isPublished: false };
      else if (action === "restore") update = { archived: false, isPublished: false };
      else update = { isPublished: false };
      const [saved] = await transaction.update(forms).set({ ...update, updatedAt: new Date() }).where(owned).returning();
      return json(saved);
    });
  });
}
