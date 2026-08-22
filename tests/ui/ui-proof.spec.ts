import { mkdir, writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const output = "ui-proof";
const sessionToken = "ui-proof-session-token";
const baseUrl = "http://127.0.0.1:3000";
const fakePng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XfM0WQAAAABJRU5ErkJggg==",
  "base64",
);

async function prepare(page: Page) {
  await mkdir(output, { recursive: true });
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.route(
    /^https:\/\/(s4\.anilist\.co|covers\.openlibrary\.org|image\.tmdb\.org|media\.rawg\.io)\//,
    async route => {
      await route.fulfill({ status: 200, contentType: "image/png", body: fakePng });
    },
  );
  return { consoleErrors, pageErrors };
}

async function useFixtureSession(page: Page) {
  await page.context().addCookies([
    { name: "media_list_session", value: sessionToken, url: baseUrl, httpOnly: true, sameSite: "Lax" },
  ]);
  await page.goto("/");
  await expect(page).toHaveURL("/");
}

async function capture(page: Page, name: string) {
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  await writeFile(`${output}/${name}.html`, await page.content(), "utf8");
}

async function proveGoogleOnlyLogin(page: Page) {
  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByText("Password sign in", { exact: false })).toHaveCount(0);
  await expect(page.getByText("Email link", { exact: false })).toHaveCount(0);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(page.locator('form input[type="email"]')).toHaveCount(0);

  for (const path of ["/login/magic?token=obsolete", "/register?token=obsolete", "/reset-password?token=obsolete"]) {
    const response = await page.request.get(path, { maxRedirects: 0 });
    expect(response.status(), `${path} must not remain an auth route`).toBe(404);
  }
}

test("desktop Google-only login, library views and IAM-owned users are stable", async ({ page }) => {
  const diagnostics = await prepare(page);
  await page.setViewportSize({ width: 1440, height: 1000 });

  await proveGoogleOnlyLogin(page);
  await capture(page, "login-desktop");

  await useFixtureSession(page);
  await expect(page.getByRole("link", { name: "+ Add media" })).toBeVisible();
  await expect(page.locator(".libraryTableWrap")).toBeVisible();
  await capture(page, "library-table-desktop");

  const completedRow = page.locator("tr", { hasText: "Attack on Titan" }).first();
  await expect(completedRow.locator('input[name="progressCurrent"]')).toHaveCount(1);
  await expect(completedRow.locator('input[name="progressTotal"]')).toHaveCount(0);
  await expect(completedRow.locator(".progressTotal")).toHaveText("/ 25");

  await page.getByRole("button", { name: "Edit notes for Pride and Prejudice" }).click();
  const notes = page.getByLabel("Notes for Pride and Prejudice");
  await expect(notes).toBeVisible();
  await capture(page, "library-notes-edit-desktop");
  await notes.press("Escape");

  await page.getByRole("button", { name: "Filter" }).click();
  const filterDialog = page.getByRole("dialog", { name: "Filter list" });
  await expect(filterDialog).toBeVisible();
  await filterDialog.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Sort" }).click();
  const sortDialog = page.getByRole("dialog", { name: "Sort list" });
  await expect(sortDialog.getByLabel("Sort by")).toHaveValue("updated");
  await expect(sortDialog.getByLabel("Direction")).toHaveValue("desc");
  await sortDialog.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Grid view" }).click();
  const grid = page.locator(".libraryGrid");
  await expect(grid).toBeVisible();
  expect(await grid.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(4);
  await capture(page, "library-grid-desktop");

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
  await expect(page.getByText(/managed centrally/i)).toBeVisible();
  const reader = page.locator("tr", { hasText: "reader_ui" });
  await expect(reader).toContainText("reader-ui@example.com");
  await expect(reader).toContainText("USER");
  await expect(page.getByRole("button", { name: /add user|reset password|disable user|enable user|save/i })).toHaveCount(0);
  await capture(page, "users-desktop");

  expect(diagnostics.consoleErrors).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);
  await writeFile(`${output}/desktop-diagnostics.json`, JSON.stringify(diagnostics, null, 2), "utf8");
});

test("mobile keeps Google-only login and current library inside viewport", async ({ page }) => {
  const diagnostics = await prepare(page);
  await page.setViewportSize({ width: 390, height: 844 });

  await proveGoogleOnlyLogin(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await capture(page, "login-mobile");

  await useFixtureSession(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await capture(page, "library-table-mobile");

  await page.getByRole("button", { name: "Grid view" }).click();
  const grid = page.locator(".libraryGrid");
  await expect(grid).toBeVisible();
  expect(await grid.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await capture(page, "library-grid-mobile");

  await page.goto("/admin");
  await expect(page.getByText(/managed centrally/i)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await capture(page, "users-mobile");

  expect(diagnostics.consoleErrors).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);
  await writeFile(`${output}/mobile-diagnostics.json`, JSON.stringify(diagnostics, null, 2), "utf8");
});
