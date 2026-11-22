# Development

Fold uses Next.js App Router/React/TypeScript, Better Auth, Drizzle and PostgreSQL.
Pages/routes are in `app/`, form UI in `components/forms/`, validation and CSV
helpers in `lib/`, and authorization/database services in `server/`.
`project.json` records the repository identity; deployment belongs to the recipe.

Use Node 24.22.3 and pnpm 11.18.0. Install with
`pnpm install --frozen-lockfile`; use Python 3 with `PyYAML==6.0.3` for policy checks.
Copy `.env.example` to ignored `.env.local` and fill only your local values.
`BETTER_AUTH_SECRET` and `DEMO_PASSWORD` must be unique, generated values.

The opt-in PostgreSQL service is `compose.dev.yaml`. Start it with an explicit
project name, for example `docker compose -p fold-dev -f compose.dev.yaml up -d`.
Check for port collisions first. Preserve existing volumes; never use a customer
workspace as a fixture. `pnpm db:migrate` applies committed migrations using
`.env.local`; `pnpm dev` runs at `http://127.0.0.1:3000` by default. The configured
`BETTER_AUTH_URL` must match that exact origin.

| Command | Purpose |
| --- | --- |
| `pnpm check` | TypeScript checks |
| `pnpm test` | Schema/CSV, origin and recovery unit tests |
| `pnpm test:policy` | Repository and CI conventions |
| `pnpm build` | Standalone production build |
| `pnpm verify` | Source checks, policy and build |
| `pnpm db:migrate` | Apply committed Drizzle migrations |
| `pnpm db:seed` | Fictional template initialization; explicit runtime env needed |
| `pnpm test:production` | Built-image/database/browser checks |

When changing authentication schema, use the pinned `auth` CLI with
`.neander/auth-schema-config.ts`, then generate/review Drizzle SQL. Never use
`auth migrate` with the Drizzle adapter. Keep migrations separate from image
build/startup. Read [deployment contract](deployment-contract.md) and installed
Next.js docs before changing those boundaries.

Keep private writes authorized by both session/workspace ownership and the exact
configured Origin. Respondents may only access published public forms, never
owner responses. The saved published schema is separate from the editable draft.
Recovery is optional and disabled by default; see [setup](password-recovery.md).

PRs require policy/app/runtime/security checks and maintainer/code-owner review.
Public CI uses SHA-pinned Actions, read-only permissions and no retained checkout
credentials or cloud secrets. Use fictional accounts/data in source and evidence.
