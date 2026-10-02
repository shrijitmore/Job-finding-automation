import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { createProfile, signIn } from "./helpers";

const RESUME_PDF = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../packages/core/test-fixtures/resume.pdf");

test("dry run end to end: run now, dashboard, applications and detail", async ({ page }, info) => {
  test.setTimeout(120_000);
  test.skip(info.project.name === "mobile", "Run once; the mobile layout is checked separately below");
  await signIn(page);
  const profileId = await createProfile(page, "Dry Run Jane");

  await page.getByLabel("Resume file").setInputFiles(RESUME_PDF);
  await page.getByRole("button", { name: "Save master resume" }).click();
  await expect(page).toHaveURL(/skills$/);

  await page.goto(`/p/${profileId}/preferences`);
  await page.getByRole("button", { name: "Backend Engineer", exact: true }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved")).toBeVisible();

  // Only use the local fixture feed: disable seeded internet sources.
  const sources = await (await page.request.get("/api/sources")).json();
  for (const s of sources) await page.request.patch(`/api/sources/${s.id}`, { data: { enabled: false } });
  await page.request.post("/api/sources", { data: { url: "http://127.0.0.1:4557/feed.rss", name: "E2E feed", fields: ["engineering"] } });

  await page.goto(`/p/${profileId}/dashboard`);
  await expect(page.getByText("Dry run is on")).toBeVisible();
  await page.getByRole("button", { name: "Run now (dry run)" }).click();
  await expect(page.getByText("Queued. Watch progress in Run logs.")).toBeVisible();

  // The worker fetches, scores, tailors and records would-be applications.
  await expect(async () => {
    await page.reload();
    await expect(page.getByText("Senior Backend Engineer")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 90_000, intervals: [2000] });
  await expect(page.getByText("succeeded")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("link", { name: "All" }).click();
  await expect(page).toHaveURL(/applications$/);
  await page.getByLabel("Status").selectOption("dry_run");
  await expect(page.getByRole("link", { name: "Senior Backend Engineer" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Backend Developer" })).toHaveCount(0);

  await page.getByRole("link", { name: "Senior Backend Engineer" }).click();
  await expect(page.getByText("Would have applied via Email to")).toBeVisible();
  await expect(page.getByText("jobs@ledgerly.io")).toBeVisible();
  await expect(page.frameLocator('iframe[title="Tailored resume"]').locator("body")).toBeVisible();
  const pdf = await page.request.get(`/api/profiles/${profileId}/applications/${page.url().split("/").pop()}/pdf`);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");

  await page.getByRole("tab", { name: "Cover note" }).click();
  await expect(page.getByText("Validation passed after 1 attempt")).toBeVisible();
  await page.getByRole("tab", { name: "Fit" }).click();
  await expect(page.getByText("Matched skills")).toBeVisible();

  // Manual apply shows a direct link and can be marked as applied.
  await page.goto(`/p/${profileId}/applications?status=manual_apply`);
  await page.getByRole("link", { name: "Backend Developer" }).first().click();
  await expect(page.getByRole("button", { name: "Open application" })).toBeVisible();
  await page.getByRole("button", { name: "Mark as applied" }).click();
  await expect(page.getByText("Applied", { exact: true }).first()).toBeVisible();
});

test("dashboard renders on mobile", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile");
  await signIn(page);
  const profileId = await createProfile(page, "Mobile Dash");
  await page.goto(`/p/${profileId}/dashboard`);
  await expect(page.getByText("Applied today")).toBeVisible();
  await expect(page.getByRole("link", { name: "Applications" }).last()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
