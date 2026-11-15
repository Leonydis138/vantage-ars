import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
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
    clarificationSentAt: timestamp("clarification_sent_at", { withTimezone: true }),
    resolutionAttemptedAt: timestamp("resolution_attempted_at", { withTimezone: true }),
    escalatedAt: timestamp("escalated_at", { withTimezone: true }),
    followUpSentAt: timestamp("follow_up_sent_at", { withTimezone: true }),
    schedulingEmailSentAt: timestamp("scheduling_email_sent_at", { withTimezone: true }),
    summary: text("summary"),
    category: text("category"),
    urgency: text("urgency"),
    sentiment: text("sentiment"),
    language: text("language"),
    tags: jsonb("tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    priorityScore: integer("priority_score").notNull().default(50),
    aiConfidence: numeric("ai_confidence", { precision: 4, scale: 3 }),
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
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
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
    index("vantage_ars_inquiries_quote_status_idx").on(table.quoteStatus),
    index("vantage_ars_inquiries_hubspot_status_idx").on(
      table.hubspotSyncStatus,
    ),
    index("vantage_ars_inquiries_thread_idx").on(table.gmailThreadId),
    index("vantage_ars_inquiries_received_at_idx").on(table.receivedAt),
  ],
);

export const vantageAutomationSettingsTable = pgTable(
  "vantage_ars_automation_settings",
  {
    id: serial("id").primaryKey(),
    enabled: boolean("enabled").notNull().default(false),
    pausedByOwner: boolean("paused_by_owner").notNull().default(false),
    autonomousSendingEnabled: boolean("autonomous_sending_enabled")
      .notNull()
      .default(true),
    bankAccountName: text("bank_account_name"),
    bankName: text("bank_name"),
    bankAccountNumber: text("bank_account_number"),
    bankBranchCode: text("bank_branch_code"),
    bankAccountType: text("bank_account_type"),
    schedulingUrl: text("scheduling_url"),
    notificationWebhookUrl: text("notification_webhook_url"),
    notificationWebhookSecret: text("notification_webhook_secret"),
    slaHours: integer("sla_hours").notNull().default(24),
    followUpDays: integer("follow_up_days").notNull().default(7),
    archiveDays: integer("archive_days").notNull().default(30),
    lastCycleSummary: jsonb("last_cycle_summary")
      .$type<Array<{ key: string; label: string; message: string }>>(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastDigestAt: timestamp("last_digest_at", { withTimezone: true }),
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
    index("vantage_ars_audit_events_event_type_idx").on(table.eventType),
    index("vantage_ars_audit_events_created_at_idx").on(table.createdAt),
  ],
);

export type VantageInquiry = typeof vantageInquiriesTable.$inferSelect;
export type NewVantageInquiry = typeof vantageInquiriesTable.$inferInsert;
export type VantageAutomationSettings =
  typeof vantageAutomationSettingsTable.$inferSelect;


export const vantageSolutionPatternsTable = pgTable(
  "vantage_ars_solution_patterns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    keywords: text("keywords").notNull(),
    steps: jsonb("steps").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    successCount: integer("success_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);


export const vantageAutomationRunsTable = pgTable(
  "vantage_ars_automation_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    status: text("status").notNull().default("completed"),
    message: text("message").notNull(),
    steps: jsonb("steps")
      .$type<Array<{ key: string; label: string; message: string }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("vantage_ars_automation_runs_created_at_idx").on(table.createdAt),
  ],
);
