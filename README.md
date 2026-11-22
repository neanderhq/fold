# Fold

Fold is a Tally-inspired form builder with a single-owner workspace. Build forms,
share public links or embeds, collect responses and export spreadsheet-safe CSV.
It is an independent application; it is not affiliated with Tally.

Fold is also an open-source [Neander](https://neander.ai) template. Selecting it
seeds a normal project with this application and fictional examples. Neander's
normal Publish workflow deploys the app; later edits and republication use that
same workflow. You can run and modify the source independently under MIT.

## Included

- Email/password login and one private workspace per owner.
- Short/long text, email, number, date, single/multiple choice, dropdown, rating
  and consent questions, plus heading/description blocks and draft previews.
- Save draft, publish/republish, unpublish, duplicate, rename, archive and restore.
- Public forms and iframe embeds; private response lists/details, filtering,
  pagination and CSV export. Responses retain the schema used at submission.
- PostgreSQL migrations, fictional sample forms/responses and isolated tests.
- Optional Better Auth password recovery through your own Resend configuration.

This version does not include shared/team workspaces, file uploads, conditional
logic, payments or third-party business integrations. External HTTPS logos are
loaded by the browser. Password recovery is disabled until configured with a
verified sender; template publication does not supply an email provider account.

## Run locally

Use Node 24.22.3 and pnpm 11.18.0 (`mise.toml`), Docker, and Python 3 with
`PyYAML==6.0.3` for policy/deployment checks.

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
# Fill your local DATABASE_URL and generate unique BETTER_AUTH_SECRET/DEMO_PASSWORD.
docker compose -p fold-dev -f compose.dev.yaml up -d --wait postgres
pnpm db:migrate
node --env-file=.env.local --import tsx scripts/seed-template.ts
pnpm dev
```

The local database example uses `127.0.0.1:55432`, database/user `neander_dev` and
password `neander_dev_only`; these are development fixtures, not deployment
credentials. Set `BETTER_AUTH_URL=http://127.0.0.1:3000` and open that exact origin.
Use a different free port/project when another database already occupies it.
The seed creates fictional examples and preserves later edits when repeated.
Never point migration, seed or test commands at an existing customer database.

Run `pnpm verify` for source checks and build. See [development](docs/development.md)
and [testing](docs/testing.md) for production-image and browser verification.

## Deploy

`.neander/compose.yaml` is the normal Neander Publish recipe. It declares managed
PostgreSQL, the deployed public origin, generated authentication/demo secrets and
separately applied Drizzle migrations. `.neander/Dockerfile` builds the unprivileged
standalone runtime; `/api/health` is public and database-free.

`.neander/template.yaml` owns the library description, screenshots and seed command.
The private Neander publisher verifies the exact source commit and registers its
immutable image digests and public screenshots. Public app CI has no cloud keys
or private publishing tools. Source remains in GitHub; publication does not
expose a live user database or deploy a user application.

[Security reporting and maintenance](SECURITY.md) · [MIT license](LICENSE)
