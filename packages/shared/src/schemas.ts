import { z } from "zod";
import { FIELDS } from "./fields";

export const FieldSchema = z.enum(FIELDS);

// ---------- Master resume ----------

export const ContactSchema = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  location: z.string(),
  headline: z.string(),
});
export type Contact = z.infer<typeof ContactSchema>;

export const ExperienceSchema = z.object({
  id: z.string(),
  title: z.string(),
  company: z.string(),
  location: z.string(),
  startDate: z.string().describe("As written in the resume, e.g. 'Jan 2021' or '2021'"),
  endDate: z.string().describe("As written, or 'Present'"),
  bullets: z.array(z.string()),
});
export type Experience = z.infer<typeof ExperienceSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  url: z.string(),
  bullets: z.array(z.string()),
  skills: z.array(z.string()),
});
export type Project = z.infer<typeof ProjectSchema>;

export const EducationSchema = z.object({
  id: z.string(),
  institution: z.string(),
  degree: z.string(),
  field: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  details: z.string(),
});
export type Education = z.infer<typeof EducationSchema>;

export const PORTFOLIO_KINDS = [
  "github",
  "behance",
  "dribbble",
  "youtube",
  "instagram",
  "linkedin",
  "website",
  "other",
] as const;
export const PortfolioLinkSchema = z.object({
  kind: z.enum(PORTFOLIO_KINDS),
  url: z.string(),
  label: z.string(),
});
export type PortfolioLink = z.infer<typeof PortfolioLinkSchema>;

export const MasterResumeSchema = z.object({
  contact: ContactSchema,
  summary: z.string(),
  yearsOfExperience: z.number().describe("Total professional years, 0 if unknown"),
  experience: z.array(ExperienceSchema),
  projects: z.array(ProjectSchema),
  education: z.array(EducationSchema),
  skills: z.array(z.string()),
  metrics: z.array(z.string()).describe("Every quantified achievement exactly as written, e.g. 'cut load time by 40%'"),
  portfolioLinks: z.array(PortfolioLinkSchema),
  certifications: z.array(z.string()),
});
export type MasterResume = z.infer<typeof MasterResumeSchema>;

export function emptyMasterResume(): MasterResume {
  return {
    contact: { name: "", email: "", phone: "", location: "", headline: "" },
    summary: "",
    yearsOfExperience: 0,
    experience: [],
    projects: [],
    education: [],
    skills: [],
    metrics: [],
    portfolioLinks: [],
    certifications: [],
  };
}

// ---------- Skills ----------

export const SkillTierSchema = z.enum(["core", "extended"]);
export type SkillTier = z.infer<typeof SkillTierSchema>;

export const ProfileSkillSchema = z.object({
  name: z.string().min(1),
  tier: SkillTierSchema,
});
export type ProfileSkill = z.infer<typeof ProfileSkillSchema>;

// ---------- Preferences ----------

export const WORK_MODES = ["remote", "hybrid", "onsite"] as const;
export const JOB_TYPES = ["full-time", "part-time", "contract", "freelance"] as const;
export const WorkModeSchema = z.enum(WORK_MODES);
export const JobTypeSchema = z.enum(JOB_TYPES);
export type WorkMode = z.infer<typeof WorkModeSchema>;
export type JobType = z.infer<typeof JobTypeSchema>;

export const CustomRoleTypeSchema = z.object({
  id: z.string(),
  label: z.string().min(1),
  field: FieldSchema,
  keywords: z.array(z.string()),
});

export const PreferencesSchema = z.object({
  roleTypeIds: z.array(z.string()),
  customRoleTypes: z.array(CustomRoleTypeSchema),
  minYears: z.number().min(0).max(50),
  maxYears: z.number().min(0).max(50),
  locations: z.array(z.string()),
  workModes: z.array(WorkModeSchema),
  jobTypes: z.array(JobTypeSchema),
  excludedCompanies: z.array(z.string()),
  excludedKeywords: z.array(z.string()),
  minFitScore: z.number().min(0).max(100),
  maxPostedDays: z.number().min(1).max(90),
});
export type Preferences = z.infer<typeof PreferencesSchema>;

export const DEFAULT_PREFERENCES: Preferences = {
  roleTypeIds: [],
  customRoleTypes: [],
  minYears: 0,
  maxYears: 10,
  locations: [],
  workModes: ["remote", "hybrid", "onsite"],
  jobTypes: ["full-time"],
  excludedCompanies: [],
  excludedKeywords: [],
  minFitScore: 70,
  maxPostedDays: 21,
};

// ---------- Schedule ----------

export const ScheduleSchema = z.object({
  timezone: z.string(),
  runTimes: z.array(z.string().regex(/^\d{2}:\d{2}$/)).min(1).max(6),
  dailyCap: z.number().int().min(0).max(100),
  companyCooldownDays: z.number().int().min(0).max(365),
  dryRun: z.boolean(),
  enabled: z.boolean(),
});
export type Schedule = z.infer<typeof ScheduleSchema>;

export const DEFAULT_SCHEDULE: Schedule = {
  timezone: "Asia/Kolkata",
  runTimes: ["07:00", "19:00"],
  dailyCap: 15,
  companyCooldownDays: 30,
  dryRun: true,
  enabled: false,
};

// ---------- Writing style ----------

export const StyleRulesSchema = z.object({
  banEmDashes: z.boolean(),
  banEnDashes: z.boolean(),
  shortSentences: z.boolean(),
  noPowerVerbBullets: z.boolean(),
  productFocused: z.boolean(),
  bannedPhrases: z.array(z.string()),
  powerVerbs: z.array(z.string()),
  extraInstructions: z.string(),
});
export type StyleRules = z.infer<typeof StyleRulesSchema>;

export const DEFAULT_STYLE_RULES: StyleRules = {
  banEmDashes: true,
  banEnDashes: true,
  shortSentences: true,
  noPowerVerbBullets: true,
  productFocused: true,
  bannedPhrases: [
    "passionate about",
    "results-driven",
    "results-oriented",
    "detail-oriented",
    "team player",
    "go-getter",
    "synergy",
    "think outside the box",
    "hit the ground running",
    "self-starter",
    "proven track record",
    "dynamic",
    "leverage",
    "leveraged",
    "spearheaded",
    "cutting-edge",
    "best-in-class",
    "world-class",
    "seasoned",
    "I am writing to",
    "I believe",
    "I am excited to",
    "thrilled",
    "rockstar",
    "ninja",
    "guru",
  ],
  powerVerbs: [
    "Spearheaded",
    "Orchestrated",
    "Championed",
    "Pioneered",
    "Revolutionized",
    "Leveraged",
    "Utilized",
    "Drove",
    "Harnessed",
    "Catalyzed",
    "Supercharged",
    "Masterminded",
  ],
  extraInstructions: "",
};

// ---------- Jobs ----------

export const ScrapedJobSchema = z.object({
  title: z.string(),
  company: z.string(),
  location: z.string(),
  url: z.string(),
  description: z.string(),
  posted_date: z.string().describe("ISO date YYYY-MM-DD, or empty string if unknown"),
  apply_email: z.string().describe("Email address to apply to if the listing asks for one, else empty"),
  job_type: z.string().describe("full-time, part-time, contract, freelance, or empty"),
});
export type ScrapedJob = z.infer<typeof ScrapedJobSchema>;

export const ATS_KINDS = ["greenhouse", "lever", "ashby"] as const;
export type AtsKind = (typeof ATS_KINDS)[number];

export interface NormalizedJob {
  title: string;
  company: string;
  location: string;
  url: string;
  canonicalUrl: string;
  description: string;
  postedAt: string | null;
  applyEmail: string | null;
  applyUrl: string | null;
  jobType: JobType | null;
  workMode: WorkMode | null;
  ats: AtsKind | null;
  atsBoardToken?: string | null;
  atsJobId?: string | null;
  sourceId: string;
  fields: string[];
}

// ---------- Scoring ----------

export const APPLY_CHANNELS = ["email", "greenhouse", "lever", "ashby", "manual"] as const;
export type ApplyChannel = (typeof APPLY_CHANNELS)[number];

export const ScoreResultSchema = z.object({
  fit_score: z.number().describe("0 to 100"),
  role_type: z.string().describe("Best matching role type label from the candidate's targets"),
  field: FieldSchema,
  reasons: z.array(z.string()).describe("Short reasons for the score"),
  matched_skills: z.array(z.string()),
  missing_skills: z.array(z.string()),
  red_flags: z.array(z.string()),
  apply_channel: z.enum(APPLY_CHANNELS),
});
export type ScoreResult = z.infer<typeof ScoreResultSchema>;

// ---------- Tailoring ----------

export const TailoredResumeSchema = z.object({
  summary: z.string(),
  experience: z.array(
    z.object({
      id: z.string().describe("id of the master resume experience entry"),
      bullets: z.array(z.string()),
    }),
  ),
  projects: z.array(
    z.object({
      id: z.string().describe("id of the master resume project"),
      bullets: z.array(z.string()),
    }),
  ),
  skills: z.array(z.string()).describe("Core skills to show, all from the candidate's skill list"),
  alsoWorkingWith: z.array(z.string()).describe("Extended skills relevant to the JD"),
  portfolioLinks: z.array(z.string()).describe("URLs of the most relevant portfolio links, best first"),
  coverNote: z.string().describe("Under 120 words"),
});
export type TailoredResume = z.infer<typeof TailoredResumeSchema>;

// ---------- Applications & replies ----------

export const APPLICATION_STATUSES = [
  "scored",
  "tailored",
  "validation_failed",
  "ready",
  "dry_run",
  "applied",
  "manual_apply",
  "skipped",
  "failed",
  "replied",
  "interview",
  "rejected",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const REPLY_CATEGORIES = [
  "resume_request",
  "portfolio_request",
  "interview_scheduling",
  "salary_question",
  "assessment",
  "rejection",
  "other",
] as const;
export type ReplyCategory = (typeof REPLY_CATEGORIES)[number];
export const AUTO_REPLY_CATEGORIES: readonly ReplyCategory[] = ["resume_request", "portfolio_request"];

export const ReplyClassificationSchema = z.object({
  category: z.enum(REPLY_CATEGORIES),
  confidence: z.number().describe("0 to 1"),
  summary: z.string(),
  suggested_reply: z.string().describe("A draft reply that never commits to times, salary numbers or deadlines"),
});
export type ReplyClassification = z.infer<typeof ReplyClassificationSchema>;

export const RUN_STATUSES = ["queued", "running", "succeeded", "failed", "partial"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
