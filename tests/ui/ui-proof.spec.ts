import { mkdir, writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const output = "ui-proof";
const fakePng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XfM0WQAAAABJRU5ErkJggg==", "base64");

async function prepare(page: Page) {
  await mkdir(output, { recursive: true });
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route(/^https:\/\/(s4\.anilist\.co|covers\.openlibrary\.org|image\.tmdb\.org|media\.rawg\.io)\//, async (route) => {
    await route.fulfill({ status: 200, contentType: "image/png", body: fakePng });
  });
  return { consoleErrors, pageErrors };
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Username").fill("admin_ui");
  await page.getByLabel("Password").fill("ui-proof-password");
  await Promise.all([page.waitForURL("/"), page.getByRole("button", { name: "Sign in" }).click()]);
}

async function capture(page: Page, name: string) {
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  await writeFile(`${output}/${name}.html`, await page.content(), "utf8");
}

test("desktop library and admin layouts expose stable inline controls", async ({ page }) => {
  const diagnostics = await prepare(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await expect(page.getByRole("heading", { name: "Your media" })).toBeVisible();
  await capture(page, "library-desktop");

  const completedRow = page.locator("tr", { hasText: "Attack on Titan" }).first();
  await expect(completedRow.locator('input[name="progressCurrent"]')).toHaveCount(1);
  await expect(completedRow.locator('input[name="progressTotal"]')).toHaveCount(0);
  await expect(completedRow.locator(".progressTotal")).toHaveText("/ 25");

  await page.getByRole("button", { name: "Edit notes for Pride and Prejudice" }).click();
  const notes = page.getByLabel("Notes for Pride and Prejudice");
  await expect(notes).toBeVisible();
  const titleBox = await page.locator("tr", { hasText: "Pride and Prejudice" }).locator(".rowTitleBlock").boundingBox();
  const notesBox = await notes.boundingBox();
  expect(titleBox).not.toBeNull();
  expect(notesBox).not.toBeNull();
  expect(Math.abs((titleBox?.width ?? 0) - (notesBox?.width ?? 0))).toBeLessThanOrEqual(2);
  await capture(page, "library-notes-edit-desktop");
  await notes.press("Escape");

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("dialog", { name: "List settings" })).toBeVisible();
  await capture(page, "library-settings-desktop");
  await page.getByRole("button", { name: "Close" }).click();

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
  const userRow = page.locator("tr", { hasText: "reader_ui" });
  const resetBox = await userRow.getByRole("button", { name: "Reset password" }).boundingBox();
  const disableBox = await userRow.getByRole("button", { name: "Disable user" }).boundingBox();
  expect(resetBox).not.toBeNull();
  expect(disableBox).not.toBeNull();
  expect(Math.abs((resetBox?.width ?? 0) - (disableBox?.width ?? 0))).toBeLessThanOrEqual(2);
  expect(Math.abs((resetBox?.height ?? 0) - (disableBox?.height ?? 0))).toBeLessThanOrEqual(2);
  await capture(page, "users-desktop");

  expect(diagnostics.consoleErrors).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);
  await writeFile(`${output}/desktop-diagnostics.json`, JSON.stringify(diagnostics, null, 2), "utf8");
});

test("mobile viewport contains page overflow and keeps navigation on intended rows", async ({ page }) => {
  const diagnostics = await prepare(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(pageOverflow).toBeLessThanOrEqual(1);
  const brand = page.getByRole("link", { name: "media-list" });
  await expect(brand).toHaveCSS("white-space", "nowrap");
  const tabTops = await page.locator(".statusTabs a").evaluateAll((links) => links.map((link) => Math.round(link.getBoundingClientRect().top)));
  expect(new Set(tabTops).size).toBe(1);
  await capture(page, "library-mobile");

  await page.goto("/admin");
  const adminOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(adminOverflow).toBeLessThanOrEqual(1);
  const addUserBox = await page.getByRole("button", { name: "+ Add user" }).boundingBox();
  expect(addUserBox).not.toBeNull();
  expect(addUserBox?.width ?? 0).toBeGreaterThan(300);
  await capture(page, "users-mobile");

  expect(diagnostics.consoleErrors).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);
  await writeFile(`${output}/mobile-diagnostics.json`, JSON.stringify(diagnostics, null, 2), "utf8");
});
