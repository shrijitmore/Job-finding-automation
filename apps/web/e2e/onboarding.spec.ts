import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { createProfile, signIn } from "./helpers";

const RESUME_PDF = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../packages/core/test-fixtures/resume.pdf");

test("upload, review and save a resume, then manage skills and preferences", async ({ page }, info) => {
  await signIn(page);
  await createProfile(page, `Onboard ${info.project.name}`);

  await page.getByLabel("Resume file").setInputFiles(RESUME_PDF);
  await expect(page.getByRole("heading", { name: "Master resume" })).toBeVisible();
  await expect(page.getByText("Review what we parsed")).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Jane Doe");

  // Fix a parsed field and add a creative portfolio link.
  await page.getByLabel("Headline").fill("Product-minded Full Stack Engineer");
  await page.getByLabel("YouTube").fill("https://youtube.com/@janedoe");
  // Leave Redis out of the profile skills.
  await page.getByRole("checkbox", { name: "Redis" }).uncheck();
  await page.getByRole("button", { name: "Save master resume" }).click();

  await expect(page).toHaveURL(/\/skills$/);
  await expect(page.getByText("Core skills (8)")).toBeVisible();
  await page.getByRole("radiogroup", { name: "GraphQL tier" }).getByRole("radio", { name: "extended" }).click();
  await page.getByRole("textbox", { name: "New skill" }).fill("Rust, Solidity");
  await page.getByRole("radiogroup", { name: "New skill tier" }).getByRole("radio", { name: "extended" }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("All changes saved").or(page.getByText("Saved"))).toBeVisible();
  await page.reload();
  await expect(page.getByText("Extended skills (3)")).toBeVisible();
  await expect(page.getByText("Core skills (7)")).toBeVisible();

  await page.goto(page.url().replace(/skills$/, "preferences"));
  await page.getByLabel("Search roles").fill("video");
  await page.getByRole("button", { name: "Video Editor", exact: true }).click();
  await page.getByLabel("Search roles").fill("");
  await page.getByRole("button", { name: "Full Stack Engineer", exact: true }).click();
  await page.getByLabel("Custom role").fill("Thumbnail Designer");
  await page.getByRole("button", { name: "Add custom role" }).click();
  await page.getByLabel("Minimum fit score").fill("80");
  await page.getByRole("group", { name: "Job type" }).getByRole("button", { name: "contract" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved")).toBeVisible();
  await page.reload();
  await expect(page.getByText("3 selected")).toBeVisible();
  await expect(page.getByText("Minimum fit score: 80")).toBeVisible();

  // Edited headline persisted on the resume.
  await page.goto(page.url().replace(/preferences$/, "resume"));
  await expect(page.getByLabel("Headline")).toHaveValue("Product-minded Full Stack Engineer");
  await expect(page.getByLabel("YouTube")).toHaveValue("https://youtube.com/@janedoe");
});

test("writing style and schedule defaults", async ({ page }, info) => {
  await signIn(page);
  await createProfile(page, `Style ${info.project.name}`);
  await page.goto(page.url().replace(/resume$/, "style"));
  await expect(page.getByRole("switch", { name: "No em dashes" })).toHaveAttribute("aria-checked", "true");
  await page.getByLabel("Banned phrases").fill("synergize");
  await page.getByLabel("Banned phrases").press("Enter");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved")).toBeVisible();

  await page.goto(page.url().replace(/style$/, "schedule"));
  await expect(page.getByRole("switch", { name: "Dry run" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByLabel("Run time 1")).toHaveValue("07:00");
  await expect(page.getByLabel("Run time 2")).toHaveValue("19:00");
  await expect(page.getByLabel("Daily application cap")).toHaveValue("15");
});
