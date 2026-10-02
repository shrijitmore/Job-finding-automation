import { expect, test } from "@playwright/test";
import { createProfile, signIn } from "./helpers";

test("sources manager: seeds, proposals, add, toggle and filter", async ({ page }, info) => {
  await signIn(page);
  await createProfile(page, `Sources ${info.project.name}`);
  await page.goto(page.url().replace(/resume$/, "sources"));

  await expect(page.getByText("HN Who is Hiring")).toBeVisible();
  await expect(page.getByText("Suggested boards for creative, product and marketing roles")).toBeVisible();

  // Confirm one proposed board.
  const before = await page.getByRole("button", { name: /^Add Dribbble Jobs$/ }).count();
  if (before) {
    await page.getByRole("button", { name: "Add Dribbble Jobs" }).click();
    await expect(page.getByRole("button", { name: "Add Dribbble Jobs" })).toHaveCount(0);
  }
  await expect(page.getByRole("link", { name: "https://dribbble.com/jobs" })).toBeVisible();

  // Add a custom career page.
  await page.getByRole("button", { name: "Add source" }).first().click();
  const url = `https://example-${info.project.name}.com/careers`;
  await page.getByLabel("URL").fill(url);
  await expect(page.getByText("Detected: Web page (AI extractor)")).toBeVisible();
  await page.getByRole("group", { name: "Source fields" }).getByRole("button", { name: "Video" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Add source" }).click();
  await expect(page.getByRole("link", { name: url })).toBeVisible();

  // Field filter.
  await page.getByRole("button", { name: "Web3", exact: true }).click();
  await expect(page.getByText("web3.career").first()).toBeVisible();
  await expect(page.getByRole("link", { name: url })).toHaveCount(0);
  await page.getByRole("button", { name: "All", exact: true }).click();

  // Toggle off.
  const toggle = page.getByRole("switch", { name: `Enable example-${info.project.name}.com` });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
});
