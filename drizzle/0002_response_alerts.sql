CREATE TABLE "response_deliveries" (
	"response_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"detail" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "response_deliveries_response_id_kind_pk" PRIMARY KEY("response_id","kind")
);
--> statement-breakpoint
CREATE TABLE "response_settings" (
	"form_id" uuid PRIMARY KEY NOT NULL,
	"alert" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "response_deliveries" ADD CONSTRAINT "response_deliveries_response_id_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."responses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_deliveries" ADD CONSTRAINT "response_deliveries_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_settings" ADD CONSTRAINT "response_settings_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "response_deliveries_form_status_idx" ON "response_deliveries" USING btree ("form_id","kind","status");