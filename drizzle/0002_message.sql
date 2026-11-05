CREATE TABLE "message" (
	"id" text PRIMARY KEY NOT NULL,
	"inbox_id" text NOT NULL,
	"email_id" text NOT NULL,
	"message_id" text,
	"from_address" text NOT NULL,
	"from_header" text,
	"subject" text NOT NULL,
	"text_body" text,
	"html_body" text,
	"verification_code" text,
	"status" text NOT NULL,
	"raw_key" text,
	"raw_size" integer,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_status_check" CHECK ("message"."status" in ('ready', 'quota_exceeded', 'too_large'))
);
--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_inbox_id_inbox_id_fk" FOREIGN KEY ("inbox_id") REFERENCES "public"."inbox"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "message_email_inbox_unique" ON "message" USING btree ("email_id","inbox_id");--> statement-breakpoint
CREATE INDEX "message_inbox_received_idx" ON "message" USING btree ("inbox_id","received_at");