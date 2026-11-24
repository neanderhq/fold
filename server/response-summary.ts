import { sql, type SQL } from "drizzle-orm";
import { summarizeAnswerCounts, type AnswerCount } from "@/lib/response-summary";
import type { getDb } from "./db";
import { responses } from "./schema";

export async function responseSummaries(db: ReturnType<typeof getDb>, filters: SQL | undefined) {
  // Aggregate the full filtered set in the database, independently of pagination.
  const result = await db.execute<AnswerCount>(sql`
    select jsonb_build_object(
      'id', block->>'id', 'label', block->>'label', 'type', block->>'type',
      'options', block->'options', 'max', block->'max'
    ) as question,
    ${responses.answers}->(block->>'id') as answer, count(*)::int as count
    from ${responses}
    cross join lateral jsonb_array_elements(coalesce(
      ${responses.schemaSnapshot}->'blocks', jsonb_build_array(${responses.schemaSnapshot}->'question')
    )) with ordinality as fields(block, position)
    where ${filters} and block->>'type' in ('rating', 'single_choice', 'multi_choice', 'dropdown')
    group by 1, 2 order by min(position), question
  `);
  return summarizeAnswerCounts(result.rows);
}
