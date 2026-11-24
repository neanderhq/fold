# Verification

Run `pnpm verify` after [development setup](development.md). This runs type checks,
the original credential-free schema/CSV/origin/recovery unit suites, repository
policy and the production build. A build and the public health route do not
require application credentials.

## CI

- **policy** checks repository metadata/files, runtime pins, immutable Actions,
  read-only permissions and the production verification entry point.
- **app** runs source tests, deployment contract checks and production build.
- **Runtime security** (`production`) builds the real Docker image, scans its
  packages and embedded secrets with checksum-verified Trivy, initializes an
  isolated PostgreSQL service and runs `pnpm test:production`.
- **Dependency audit** audits every committed lockfile, including bundled starter
  examples. **Dependency review** rejects newly introduced known advisories.
- Extended CodeQL and secret scanning complement the tests. Daily dependency and
  production-image checks retain coverage between changes.

The production entry point is also `pnpm test:template`. It exercises the built
app, fictional seeds, owner login, private/public form behavior, persistent edits,
and existing integration/browser regression suites. CI provisions Chromium and
supplies only synthetic credentials. Keep the production suite's actual coverage
and its recorded results separate from these instructions.

## Isolated runtime verification

Build `.neander/Dockerfile`, apply `.neander/migrate.mjs` and run the fictional seed
before the smoke suite. `DATABASE_URL` and `NEANDER_TEMPLATE_TEST_DATABASE_URL`
must refer to the same explicitly disposable PostgreSQL database. Set
`NEANDER_TEMPLATE_IMAGE` to the built image and `BETTER_AUTH_URL` /
`NEANDER_TEMPLATE_TEST_ORIGIN` to its local HTTP origin. Supply unique test-only
`BETTER_AUTH_SECRET` and `DEMO_PASSWORD`; never reuse live accounts or keys.
See `.github/workflows/check.yml` for executable setup.

Existing builder/foundation/recovery tests remain under `scripts/`. They use
fictional owners or isolated database schemas and clean up only their own records.
The recovery suites inject delivery in-process and never send real email.
Browser screenshots/reports belong in ignored `.cache/` unless deliberately
reviewed, sanitized and committed as the template gallery.

Passing these checks does not certify real email delivery, physical-device
usability, Cloud Run/managed Neon rollout or desktop Neander Publish. Add focused
regressions for changed behavior and investigate scanner findings instead of
suppressing them. Do not replace application checks with boilerplate assertions.

Input/ownership scenarios use separate fictional client IPs so unrelated test
actors do not share the production sign-up limit. The recovery integration suite
separately verifies rate-limit rejection, persistence and concurrent requests.

## Editor workflow regressions

`scripts/test-editor-browser.cjs` runs against the actual local built app and an
explicitly disposable database. It checks autosave/reload, spaces while typing,
new edits during a pending successful save, an HTTP 503 save/retry fixture,
unsaved-navigation confirmation, question picker/duplication/real dragging,
explicit publication and desktop/tablet/mobile layouts. It creates and removes
only its fictional owner. The existing all-field, ownership, iframe, historical
response, filtering/export and mobile suites still run through production checks.
