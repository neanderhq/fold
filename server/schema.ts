import { sql } from "drizzle-orm";
import { boolean, check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { Answers, FormSchema } from "../lib/form-schema";
import { user } from "./auth-schema";

export * from "./auth-schema";

export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: text("owner_id").notNull().unique().references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const forms = pgTable("forms", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  draft: jsonb("draft").$type<FormSchema>().notNull(),
  published: jsonb("published").$type<FormSchema>(),
  isPublished: boolean("is_published").default(false).notNull(),
  archived: boolean("archived").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("forms_workspace_idx").on(table.workspaceId),
  check("published_schema_required", sql`not ${table.isPublished} or ${table.published} is not null`),
]);

export const responses = pgTable("responses", {
  id: uuid("id").defaultRandom().primaryKey(),
  formId: uuid("form_id").notNull().references(() => forms.id, { onDelete: "cascade" }),
  schemaSnapshot: jsonb("schema_snapshot").$type<FormSchema>().notNull(),
  answers: jsonb("answers").$type<Answers>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("responses_form_idx").on(table.formId)]);
