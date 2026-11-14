import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export type VantageQuoteLine = {
  code: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
};

export const vantageInquiriesTable = pgTable(
  "vantage_ars_inquiries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    gmailMessageId: text("gmail_message_id").notNull(),
    gmailThreadId: text("gmail_thread_id").notNull(),
    originalMessageId: text("original_message_id"),
    customerEmail: text("customer_email").notNull(),
    customerName: text("customer_name").notNull(),
    subject: text("subject").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    messageBody: text("message_body").notNull(),
    hasAttachments: boolean("has_attachments").notNull().default(false),
    summary: text("summary"),
    category: text("category"),
    urgency: text("urgency"),
    status: text("status").notNull().default("processing"),
    missingInformation: jsonb("missing_information")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    processingError: text("processing_error"),
    quoteReference: text("quote_reference"),
    quoteStatus: text("quote_status").notNull().default("none"),
    quoteLines: jsonb("quote_lines")
      .$type<VantageQuoteLine[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    quoteSubtotal: numeric("quote_subtotal", { precision: 12, scale: 2 }),
    quoteNotes: jsonb("quote_notes")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    quoteCreatedAt: timestamp("quote_created_at", { withTimezone: true }),
    quoteSentAt: timestamp("quote_sent_at", { withTimezone: true }),
    gmailSentMessageId: text("gmail_sent_message_id"),
    hubspotContactId: text("hubspot_contact_id"),
    hubspotSyncStatus: text("hubspot_sync_status")
      .notNull()
      .default("not_requested"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("vantage_ars_inquiries_gmail_message_unique").on(
      table.gmailMessageId,
    ),
    index("vantage_ars_inquiries_status_idx").on(table.status),
    index("vantage_ars_inquiries_received_at_idx").on(table.receivedAt),
  ],
);

export const vantageAutomationSettingsTable = pgTable(
  "vantage_ars_automation_settings",
  {
    id: serial("id").primaryKey(),
    enabled: boolean("enabled").notNull().default(false),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const vantageAuditEventsTable = pgTable(
  "vantage_ars_audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    inquiryId: uuid("inquiry_id").references(() => vantageInquiriesTable.id, {
      onDelete: "cascade",
    }),
    ownerUserId: text("owner_user_id").notNull(),
    eventType: text("event_type").notNull(),
    details: jsonb("details")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("vantage_ars_audit_events_inquiry_idx").on(table.inquiryId),
    index("vantage_ars_audit_events_created_at_idx").on(table.createdAt),
  ],
);

export type VantageInquiry = typeof vantageInquiriesTable.$inferSelect;
export type NewVantageInquiry = typeof vantageInquiriesTable.$inferInsert;
export type VantageAutomationSettings =
  typeof vantageAutomationSettingsTable.$inferSelect;
