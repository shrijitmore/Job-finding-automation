import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  ApplicationStatus,
  MasterResume,
  Preferences,
  ReplyCategory,
  RunStatus,
  Schedule,
  ScoreResult,
  StyleRules,
  TailoredResume,
} from "@jfa/shared";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
});

export const profiles = pgTable(
  "profiles",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    masterResume: jsonb("master_resume").$type<MasterResume>(),
    resumeFileKey: text("resume_file_key"),
    resumeText: text("resume_text"),
    preferences: jsonb("preferences").$type<Preferences>().notNull(),
    schedule: jsonb("schedule").$type<Schedule>().notNull(),
    styleRules: jsonb("style_rules").$type<StyleRules>().notNull(),
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("profiles_user_idx").on(t.userId)],
);

export const profileSkills = pgTable(
  "profile_skills",
  {
    id: id(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tier: text("tier").$type<"core" | "extended">().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("profile_skills_unique").on(t.profileId, sql`lower(${t.name})`)],
);

/** Secrets (OAuth tokens, API keys). `ciphertext` is AES-256-GCM encrypted JSON. */
export const credentials = pgTable(
  "credentials",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id").references(() => profiles.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"anthropic" | "gmail" | "telegram">().notNull(),
    ciphertext: text("ciphertext").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("credentials_scope_unique").on(
      t.userId,
      sql`coalesce(${t.profileId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      t.kind,
    ),
  ],
);

export const sources = pgTable(
  "sources",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    plugin: text("plugin").notNull(),
    url: text("url").notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    fields: text("fields").array().notNull().default(sql`'{}'::text[]`),
    enabled: boolean("enabled").notNull().default(true),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastStatus: text("last_status").$type<"ok" | "error" | "blocked" | "skipped">(),
    lastError: text("last_error"),
    lastJobCount: integer("last_job_count").notNull().default(0),
    totalJobCount: integer("total_job_count").notNull().default(0),
    blockedUntil: timestamp("blocked_until", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("sources_user_url_unique").on(t.userId, t.url)],
);

/** Content-hash cache so unchanged listing pages are not re-extracted. */
export const pageCache = pgTable("page_cache", {
  url: text("url").primaryKey(),
  contentHash: text("content_hash").notNull(),
  extracted: jsonb("extracted").$type<unknown>(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    canonicalUrl: text("canonical_url").notNull().unique(),
    dedupeHash: text("dedupe_hash").notNull(),
    title: text("title").notNull(),
    company: text("company").notNull(),
    location: text("location").notNull().default(""),
    url: text("url").notNull(),
    description: text("description").notNull().default(""),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    applyEmail: text("apply_email"),
    applyUrl: text("apply_url"),
    jobType: text("job_type"),
    workMode: text("work_mode"),
    ats: text("ats"),
    atsBoardToken: text("ats_board_token"),
    atsJobId: text("ats_job_id"),
    sourceId: uuid("source_id").references(() => sources.id, { onDelete: "set null" }),
    fields: text("fields").array().notNull().default(sql`'{}'::text[]`),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("jobs_dedupe_idx").on(t.dedupeHash), index("jobs_posted_idx").on(t.postedAt)],
);

export interface RunStats {
  fetched: number;
  newJobs: number;
  filtered: number;
  scored: number;
  shortlisted: number;
  tailored: number;
  validationFailed: number;
  applied: number;
  dryRun: number;
  manual: number;
  skipped: number;
  failed: number;
  repliesProcessed: number;
}

export interface RunError {
  step: string;
  source?: string;
  jobId?: string;
  message: string;
}

export const runs = pgTable(
  "runs",
  {
    id: id(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    trigger: text("trigger").$type<"schedule" | "manual">().notNull(),
    /** Unique per profile and slot so a retried job resumes the same run. */
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").$type<RunStatus>().notNull().default("queued"),
    dryRun: boolean("dry_run").notNull(),
    applyCap: integer("apply_cap").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    stats: jsonb("stats").$type<Partial<RunStats>>().notNull().default({}),
    timings: jsonb("timings").$type<Record<string, number>>().notNull().default({}),
    errors: jsonb("errors").$type<RunError[]>().notNull().default([]),
    blockedSources: jsonb("blocked_sources").$type<string[]>().notNull().default([]),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 10, scale: 4 }).notNull().default("0"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("runs_idempotency_unique").on(t.profileId, t.idempotencyKey),
    index("runs_profile_idx").on(t.profileId, t.createdAt),
  ],
);

export const runEvents = pgTable(
  "run_events",
  {
    id: id(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    level: text("level").$type<"info" | "warn" | "error">().notNull(),
    step: text("step").notNull(),
    message: text("message").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("run_events_run_idx").on(t.runId, t.createdAt)],
);

export interface ValidationReport {
  passed: boolean;
  attempts: number;
  issues: string[];
  pageCount?: number;
}

export const applications = pgTable(
  "applications",
  {
    id: id(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => runs.id, { onDelete: "set null" }),
    status: text("status").$type<ApplicationStatus>().notNull(),
    fitScore: integer("fit_score"),
    score: jsonb("score").$type<ScoreResult>(),
    roleType: text("role_type"),
    field: text("field"),
    template: text("template"),
    tailored: jsonb("tailored").$type<TailoredResume>(),
    coverNote: text("cover_note"),
    pdfKey: text("pdf_key"),
    screenshotKey: text("screenshot_key"),
    applyChannel: text("apply_channel"),
    applyTarget: text("apply_target"),
    validation: jsonb("validation").$type<ValidationReport>(),
    skipReason: text("skip_reason"),
    error: text("error"),
    gmailThreadId: text("gmail_thread_id"),
    gmailMessageId: text("gmail_message_id"),
    /** Set before the send/submit side effect; guards against double-apply on retry. */
    submitStartedAt: timestamp("submit_started_at", { withTimezone: true }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("applications_profile_job_unique").on(t.profileId, t.jobId),
    index("applications_profile_status_idx").on(t.profileId, t.status),
    index("applications_thread_idx").on(t.gmailThreadId),
  ],
);

export const replies = pgTable(
  "replies",
  {
    id: id(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id").references(() => applications.id, { onDelete: "set null" }),
    gmailThreadId: text("gmail_thread_id").notNull(),
    gmailMessageId: text("gmail_message_id").notNull(),
    fromAddress: text("from_address").notNull(),
    subject: text("subject").notNull().default(""),
    body: text("body").notNull().default(""),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    category: text("category").$type<ReplyCategory>(),
    confidence: numeric("confidence", { precision: 4, scale: 3 }),
    summary: text("summary"),
    suggestedReply: text("suggested_reply"),
    status: text("status")
      .$type<"new" | "auto_replied" | "auto_reply_pending" | "flagged" | "sent" | "dismissed">()
      .notNull()
      .default("new"),
    sentReply: text("sent_reply"),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("replies_message_unique").on(t.profileId, t.gmailMessageId),
    index("replies_profile_idx").on(t.profileId, t.receivedAt),
  ],
);

export const tokenUsage = pgTable(
  "token_usage",
  {
    id: id(),
    profileId: uuid("profile_id").references(() => profiles.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => runs.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("token_usage_profile_idx").on(t.profileId, t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type ProfileSkillRow = typeof profileSkills.$inferSelect;
export type Credential = typeof credentials.$inferSelect;
export type Source = typeof sources.$inferSelect;
export type NewSource = typeof sources.$inferInsert;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type Run = typeof runs.$inferSelect;
export type RunEvent = typeof runEvents.$inferSelect;
export type Application = typeof applications.$inferSelect;
export type Reply = typeof replies.$inferSelect;
export type TokenUsageRow = typeof tokenUsage.$inferSelect;
