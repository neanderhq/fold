# Stack

Fold uses Next.js App Router, React and TypeScript with its existing reusable UI
components. Better Auth owns email/password sessions and password recovery;
Drizzle owns application queries and versioned PostgreSQL migrations.

The production build is a standalone Node.js container. `.neander/compose.yaml`
is the publishing recipe, with managed database/origin bindings and generated
runtime secrets. Builds and `/api/health` work without database credentials.
Migrations run separately, and optional Resend delivery is disabled by default.

Private APIs authorize session and workspace ownership on the server. Mutations
also require the configured exact Origin. Public form endpoints use the saved
published schema; response snapshots preserve its version at submission.
Single-owner workspaces are implemented; shared/team collaboration is outside
this version. See [builder behavior](../builder.md) and [testing](../testing.md).
