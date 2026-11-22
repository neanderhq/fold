# Development guidance

- Read `README.md`, `docs/development.md` and `docs/testing.md` before changes.
- Preserve Fold's single-owner workspace model, field validation, server-side
  authorization, immutable response snapshots and separate saved/published drafts.
- Run `pnpm verify` and the relevant isolated production/integration checks.
- Keep `.neander/compose.yaml`, migrations, fictional seeds and runtime inputs in
  sync. Preserve the public database-free health endpoint and MIT license.
- Keep credentials in ignored environment files. Never commit private workspace
  records, provider credentials, reset tokens, cookies or browser evidence.
- Use explicitly disposable PostgreSQL databases for tests. Scope local Docker
  Compose with a unique `-p` and `-f`; preserve existing volumes and user data.
- Generate Better Auth tables with the pinned `auth` CLI, then generate and commit
  Drizzle migrations. Do not hand-author auth tables or run `auth migrate` with
  the Drizzle adapter. Migration runs separately from build/startup.
- Keep the managed Neon publishing recipe, explicit `provider: null` requirements
  and static recipe-validation fast path. Do not add generic Neon-hostname guards.
- Recovery delivery stays disabled until the deployment operator configures a
  verified sender. Local tests must never send real email.
- Before Next.js changes, read the relevant installed `node_modules/next/dist/docs/`
  guide. Keep client calls relative and runtime secrets server-side.
- Report local/CI coverage separately from Cloud Run, managed Neon, real email
  delivery, physical-device usability and desktop Neander Publish verification.
- Use feature branches and PRs; preserve required checks and maintainer review.
