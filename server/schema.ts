import { sql } from "drizzle-orm";
import { boolean, check, index, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { Answers, FormSchema } from "../lib/form-schema";
import type { AlertSettings, DeliveryKind, DeliveryStatus } from "../lib/response-delivery";
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


export const responseSettings = pgTable("response_settings", {
  formId: uuid("form_id").primaryKey().references(() => forms.id, { onDelete: "cascade" }),
  alert: jsonb("alert").$type<AlertSettings>().notNull().default({}),
});

export const responseDeliveries = pgTable("response_deliveries", {
  responseId: uuid("response_id").notNull().references(() => responses.id, { onDelete: "cascade" }),
  formId: uuid("form_id").notNull().references(() => forms.id, { onDelete: "cascade" }),
  kind: text("kind").$type<DeliveryKind>().notNull(),
  status: text("status").$type<DeliveryStatus>().notNull().default("pending"),
  detail: text("detail"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.responseId, table.kind] }),
  index("response_deliveries_form_status_idx").on(table.formId, table.kind, table.status),
]);
