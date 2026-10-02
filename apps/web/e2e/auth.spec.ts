import { expect, test } from "@playwright/test";
import { createProfile, signIn } from "./helpers";

test("owner setup, profile creation and navigation", async ({ page }, info) => {
  await signIn(page);
  const profileId = await createProfile(page, `Jane ${info.project.name}`);
  expect(profileId).toMatch(/[0-9a-f-]{36}/);

  if (info.project.name === "mobile") {
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("link", { name: "Job preferences" }).click();
  } else {
    await page.getByRole("link", { name: "Job preferences" }).click();
  }
  await expect(page).toHaveURL(/preferences$/);
});

test("theme toggle switches to dark mode", async ({ page }) => {
  await signIn(page);
  await page.goto("/profiles");
  await page.getByRole("link", { name: "Open" }).first().click();
  const html = page.locator("html");
  const toggle = page.getByRole("button", { name: /^Theme:/ }).locator("visible=true").first();
  for (let i = 0; i < 3; i++) {
    if ((await html.getAttribute("class"))?.includes("dark")) break;
    await toggle.click();
  }
  await expect(html).toHaveClass(/dark/);
});

test("unauthenticated users are sent to login", async ({ page }) => {
  await page.goto("/profiles");
  await expect(page).toHaveURL(/\/login$/);
});
