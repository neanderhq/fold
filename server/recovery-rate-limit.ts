import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "./db";

export const recoveryRateStorage = {
  async consume(key: string, rule: { window: number; max: number }) {
    const identifier = `fold-rate:${createHash("sha256").update(key).digest("hex")}`;
    const { rows } = await getDb().execute<{ count: number; retry_after: number }>(sql`
      INSERT INTO verification (id, identifier, value, expires_at)
      VALUES (${identifier}, ${identifier}, '1', timezone('UTC', CURRENT_TIMESTAMP) + ${rule.window} * INTERVAL '1 second')
      ON CONFLICT (id) DO UPDATE SET
        value = CASE WHEN verification.expires_at <= timezone('UTC', CURRENT_TIMESTAMP) THEN '1'
          ELSE (LEAST(verification.value::integer, ${rule.max}) + 1)::text END,
        expires_at = CASE WHEN verification.expires_at <= timezone('UTC', CURRENT_TIMESTAMP)
          THEN timezone('UTC', CURRENT_TIMESTAMP) + ${rule.window} * INTERVAL '1 second' ELSE verification.expires_at END,
        updated_at = timezone('UTC', CURRENT_TIMESTAMP)
      RETURNING value::integer AS count,
        GREATEST(1, CEIL(EXTRACT(EPOCH FROM expires_at - timezone('UTC', CURRENT_TIMESTAMP))))::integer AS retry_after
    `);
    return { allowed: rows[0].count <= rule.max, retryAfter: rows[0].count <= rule.max ? null : rows[0].retry_after };
  },
};
