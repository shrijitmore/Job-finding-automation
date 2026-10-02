import type { LlmClient } from "@jfa/core";
import { ScrapedJobSchema, type ScrapedJob } from "@jfa/shared";
import { z } from "zod";

export const ExtractionSchema = z.object({ jobs: z.array(ScrapedJobSchema) });

export const EXTRACT_SYSTEM = `You extract job listings from the text of a careers page or job board. The text keeps links as [text](url).

Return every distinct job posting on the page as JSON. Rules:
- Only real job postings. Skip navigation, ads, categories, blog posts, company profiles and "post a job" links.
- url: the absolute link to that job's own page, copied exactly from the text. If a job has no link of its own, use the page URL.
- company: the hiring company. On a single company's careers page, use that company.
- Copy facts as written. Never invent a title, company, location, date or email. Use an empty string when a field is missing.
- description: any summary text shown next to the listing (it can be short).
- posted_date: ISO date YYYY-MM-DD. Convert relative dates like "3d ago" using today's date given below. Empty if not shown.
- apply_email: only if the listing explicitly asks applicants to email an address.
- job_type: full-time, part-time, contract or freelance if stated, else empty.`;

export async function extractListings(llm: LlmClient, pageText: string, pageUrl: string, today = new Date()): Promise<ScrapedJob[]> {
  const { data } = await llm.generate({
    purpose: "job_extract",
    schema: ExtractionSchema,
    system: EXTRACT_SYSTEM,
    content: [{ type: "text", text: `Today: ${today.toISOString().slice(0, 10)}\nPage URL: ${pageUrl}\n\n${pageText}` }],
    effort: "low",
  });
  return data.jobs;
}
