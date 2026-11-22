// Fictional template data, versioned with the app. A repeat preserves all edits.
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { hashPassword } from 'better-auth/crypto';
import { parseSchema, parseAnswers, type FormSchema } from '../lib/form-schema';

const OWNER = 'fold-template-owner';
export const FEEDBACK = 'f01d0000-0000-4000-8000-000000000001';
export async function seedTemplate(databaseUrl = process.env.DATABASE_URL, password = process.env.DEMO_PASSWORD) {
  if (!databaseUrl || !password || password.length < 12 || password.length > 128) throw new Error('DATABASE_URL and a 12–128 character DEMO_PASSWORD are required');
  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 10000 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const created = await client.query('INSERT INTO "user"(id,name,email,email_verified) VALUES($1,$2,$3,true) ON CONFLICT(id) DO NOTHING RETURNING id', [OWNER, 'Alex Morgan', 'owner@fold.test']);
    if (!created.rowCount) { await client.query('COMMIT'); return { created: false }; }
    const hash = await hashPassword(password), workspace = randomUUID();
    await client.query("INSERT INTO account(id,account_id,provider_id,user_id,password,updated_at) VALUES($1,$2,'credential',$2,$3,now())", [randomUUID(), OWNER, hash]);
    await client.query('INSERT INTO workspaces(id,owner_id) VALUES($1,$2)', [workspace, OWNER]);
    const question = (id: number, type: string, label: string, required = true, rest = {}) => ({ id: `f01d0000-0000-4000-8000-${String(id).padStart(12, '0')}`, type, label, required, ...rest });
    const samples: { id: string; schema: FormSchema; published: boolean; answers: unknown[] }[] = [
      { id: FEEDBACK, published: true, schema: parseSchema({ title: 'Customer feedback', description: 'Tell Northstar Studio how we did. These are fictional sample responses.', confirmation: 'Thanks for sharing your feedback!', blocks: [question(101, 'short_text', 'Your name'), question(102, 'rating', 'How was your experience?', true, { min: 1, max: 5 }), question(103, 'multi_choice', 'What worked well?', false, { options: ['Clarity', 'Speed', 'Support'] }), question(104, 'long_text', 'Anything we could improve?', false)] }), answers: [
        { 'f01d0000-0000-4000-8000-000000000101': 'Jamie Taylor', 'f01d0000-0000-4000-8000-000000000102': 5, 'f01d0000-0000-4000-8000-000000000103': ['Clarity', 'Support'], 'f01d0000-0000-4000-8000-000000000104': 'The project updates were easy to follow.' },
        { 'f01d0000-0000-4000-8000-000000000101': 'Casey Lee', 'f01d0000-0000-4000-8000-000000000102': 4, 'f01d0000-0000-4000-8000-000000000103': ['Speed'], 'f01d0000-0000-4000-8000-000000000104': 'A short onboarding guide would help.' },
        { 'f01d0000-0000-4000-8000-000000000101': 'Jordan Rivera', 'f01d0000-0000-4000-8000-000000000102': 5, 'f01d0000-0000-4000-8000-000000000103': ['Support'], 'f01d0000-0000-4000-8000-000000000104': 'A thoughtful experience from start to finish.' },
      ] },
      { id: 'f01d0000-0000-4000-8000-000000000002', published: true, schema: parseSchema({ title: 'Workshop registration', description: 'Reserve a place at our fictional design workshop.', confirmation: 'You are on the list. See you there!', blocks: [question(201, 'short_text', 'Your name'), question(202, 'email', 'Email address'), question(203, 'dropdown', 'Workshop', true, { options: ['Design basics', 'Prototyping', 'User research'] }), question(204, 'consent', 'I agree to be contacted about this workshop')] }), answers: [
        { 'f01d0000-0000-4000-8000-000000000201': 'Avery Chen', 'f01d0000-0000-4000-8000-000000000202': 'avery@example.invalid', 'f01d0000-0000-4000-8000-000000000203': 'Design basics', 'f01d0000-0000-4000-8000-000000000204': true },
        { 'f01d0000-0000-4000-8000-000000000201': 'Sam Ellis', 'f01d0000-0000-4000-8000-000000000202': 'sam@example.invalid', 'f01d0000-0000-4000-8000-000000000203': 'User research', 'f01d0000-0000-4000-8000-000000000204': true },
      ] },
      { id: 'f01d0000-0000-4000-8000-000000000003', published: false, schema: parseSchema({ title: 'Project enquiry', description: 'A draft to make your own before publishing.', blocks: [question(301, 'short_text', 'What are you working on?'), question(302, 'long_text', 'Tell us about the project'), question(303, 'email', 'How can we reach you?')] }), answers: [] },
    ];
    for (const sample of samples) {
      await client.query('INSERT INTO forms(id,workspace_id,draft,published,is_published) VALUES($1,$2,$3,$4,$5)', [sample.id, workspace, JSON.stringify(sample.schema), sample.published ? JSON.stringify(sample.schema) : null, sample.published]);
      for (const answers of sample.answers) await client.query('INSERT INTO responses(form_id,schema_snapshot,answers) VALUES($1,$2,$3)', [sample.id, JSON.stringify(sample.schema), JSON.stringify(parseAnswers(answers, sample.schema))]);
    }
    await client.query('COMMIT'); return { created: true };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); await pool.end(); }
}
if (process.argv[1]?.endsWith('seed-template.ts')) seedTemplate()
  .then(result => console.log(result.created ? 'Fold fictional workspace created' : 'Fold existing workspace preserved'))
  .catch(error => { console.error(error instanceof Error ? error.message : 'SEED_FAILED'); process.exitCode = 1; });
