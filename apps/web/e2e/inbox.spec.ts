import { expect, test } from "@playwright/test";
import pg from "pg";
import { createProfile, signIn } from "./helpers";

const DB = process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/jfa_e2e";

test("inbox groups replies and shows editable drafts for flagged ones", async ({ page }, info) => {
  await signIn(page);
  const profileId = await createProfile(page, `Inbox ${info.project.name}`);

  const client = new pg.Client({ connectionString: DB });
  await client.connect();
  try {
    const { rows: [job] } = await client.query(
      `insert into jobs (canonical_url, dedupe_hash, title, company, url) values ($1, $1, 'Video Editor', 'Brightside', $1) returning id`,
      [`https://brightside.media/jobs/${info.project.name}`],
    );
    const { rows: [app] } = await client.query(`insert into applications (profile_id, job_id, status) values ($1, $2, 'interview') returning id`, [profileId, job.id]);
    const insert = (id: string, category: string, status: string, summary: string, draft: string | null) =>
      client.query(
        `insert into replies (profile_id, application_id, gmail_thread_id, gmail_message_id, from_address, subject, body, received_at, category, summary, suggested_reply, status)
         values ($1, $2, 't', $3, 'ana@brightside.media', 'Re: Application', $4, now(), $5, $4, $6, $7)`,
        [profileId, app.id, `${id}-${info.project.name}`, summary, category, draft, status],
      );
    await insert("m1", "interview_scheduling", "flagged", "They want to schedule a call", "Thanks Ana. I will confirm my availability shortly.");
    await insert("m2", "resume_request", "auto_reply_pending", "They asked for a resume", null);
    await insert("m3", "rejection", "dismissed", "Not moving forward", null);
  } finally {
    await client.end();
  }

  await page.goto(`/p/${profileId}/inbox`);
  await expect(page.getByText("They want to schedule a call").first()).toBeVisible();
  const draft = page.getByLabel("Suggested draft. Edit before sending.");
  await expect(draft).toHaveValue("Thanks Ana. I will confirm my availability shortly.");
  await draft.fill("Thanks Ana. I will send my availability tomorrow.");
  await expect(page.getByRole("button", { name: "Send reply" })).toBeEnabled();

  await page.getByRole("tab", { name: /Auto-handled/ }).click();
  await expect(page.getByText("Dry run: would auto-reply")).toBeVisible();
  await page.getByRole("tab", { name: /Rejections/ }).click();
  await expect(page.getByText("Not moving forward").first()).toBeVisible();

  await page.getByRole("tab", { name: /Needs you/ }).click();
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByText("No replies need your attention.")).toBeVisible();
});
