import { expect, type Page } from "@playwright/test";

export const OWNER = { email: "owner@example.com", password: "password123" };

/** Signs in, creating the owner on the first call against a fresh database. */
export async function signIn(page: Page) {
  await page.goto("/login");
  const setupButton = page.getByRole("button", { name: "Create owner account" });
  const signInButton = page.getByRole("button", { name: "Sign in" });
  await expect(setupButton.or(signInButton)).toBeVisible();
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password").fill(OWNER.password);
  if (await setupButton.isVisible()) await setupButton.click();
  else await signInButton.click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

export async function createProfile(page: Page, name: string) {
  await page.goto("/profiles?new=1");
  await page.getByLabel("Profile name").fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForURL(/\/p\/[0-9a-f-]+\/resume/);
  return page.url().match(/\/p\/([0-9a-f-]+)\//)![1];
}
