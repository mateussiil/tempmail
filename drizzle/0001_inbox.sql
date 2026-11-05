CREATE TABLE "inbox" (
	"id" text PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"owner_id" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inbox_address_unique" UNIQUE("address")
);
--> statement-breakpoint
ALTER TABLE "inbox" ADD CONSTRAINT "inbox_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inbox_owner_idx" ON "inbox" USING btree ("owner_id");