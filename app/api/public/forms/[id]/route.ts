import { and, eq } from "drizzle-orm";
import { isRecord, parseAnswers, validId } from "@/lib/form-schema";
import { getDb } from "@/server/db";
import { forms, responses } from "@/server/schema";
import { endpoint, HttpError, json, readJson } from "@/server/http";

type Context = { params: Promise<{ id: string }> };

export function GET(_request: Request, context: Context) {
  return endpoint(async () => {
    const { id } = await context.params;
    if (!validId(id)) throw new HttpError(404, "This form is not accepting responses.");
    const [form] = await getDb().select({ schema: forms.published }).from(forms).where(and(eq(forms.id, id), eq(forms.isPublished, true), eq(forms.archived, false)));
    if (!form?.schema) throw new HttpError(404, "This form is not accepting responses.");
    return json(form.schema);
  });
}

export function POST(request: Request, context: Context) {
  return endpoint(async () => {
    const { id } = await context.params;
    if (!validId(id)) throw new HttpError(404, "This form is not accepting responses.");
    const body = await readJson(request);
    if (!isRecord(body) || Object.keys(body).some((key) => key !== "answers")) throw new HttpError(400, "Supply only answers.");
    return getDb().transaction(async (transaction) => {
      const [form] = await transaction.select().from(forms).where(and(eq(forms.id, id), eq(forms.isPublished, true), eq(forms.archived, false))).for("update");
      if (!form?.published) throw new HttpError(404, "This form is not accepting responses.");
      const answers = parseAnswers(body.answers, form.published);
      await transaction.insert(responses).values({ formId: id, answers, schemaSnapshot: form.published });
      return json({ success: true }, 201);
    });
  });
}
