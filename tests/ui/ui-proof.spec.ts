import { mkdir, writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const output = "ui-proof";
const fakePng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XfM0WQAAAABJRU5ErkJggg==",
  "base64",
);

async function prepare(page: Page) {
  await mkdir(output, { recursive: true });
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route(
    /^https:\/\/(s4\.anilist\.co|covers\.openlibrary\.org|image\.tmdb\.org|media\.rawg\.io)\//,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: fakePng,
      });
    },
  );
  return { consoleErrors, pageErrors };
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByText("Password sign in").click();
  await page.getByLabel("Username").fill("admin_ui");
  await page.getByLabel("Password").fill("ui-proof-password");
  await Promise.all([
    page.waitForURL("/"),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
}

async function capture(page: Page, name: string) {
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  await writeFile(`${output}/${name}.html`, await page.content(), "utf8");
}

test("desktop login, library views and admin layouts expose stable controls", async ({
  page,
}) => {
  const diagnostics = await prepare(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/login");
  await expect(
    page.getByRole("link", { name: "Continue with central sign-in" }),
  ).toBeVisible();
  await expect(page.getByText("Email link fallback")).toBeVisible();
  await expect(page.getByText("Password sign in fallback")).toBeVisible();
  await capture(page, "login-desktop");
  await page.goto("/login/magic?token=ui-proof-token");
  await expect(
    page.getByRole("button", { name: "Continue sign in" }),
  ).toBeVisible();
  await capture(page, "magic-login-desktop");

  await login(page);
  await expect(page.getByRole("heading", { name: "Your media" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "+ Add media" })).toBeVisible();
  await expect(page.locator(".libraryTableWrap")).toBeVisible();

  const commandBar = await page.locator(".libraryCommandBar").boundingBox();
  const statusTabs = await page.locator(".libraryStatusTabs").boundingBox();
  expect(commandBar).not.toBeNull();
  expect(statusTabs).not.toBeNull();
  expect(
    Math.abs(
      (commandBar?.x ?? 0) + (commandBar?.width ?? 0) / 2 -
        ((statusTabs?.x ?? 0) + (statusTabs?.width ?? 0) / 2),
    ),
  ).toBeLessThanOrEqual(2);

  await capture(page, "library-table-desktop");

  const completedRow = page.locator("tr", { hasText: "Attack on Titan" }).first();
  await expect(
    completedRow.locator('input[name="progressCurrent"]'),
  ).toHaveCount(1);
  await expect(completedRow.locator('input[name="progressTotal"]')).toHaveCount(
    0,
  );
  await expect(completedRow.locator(".progressTotal")).toHaveText("/ 25");

  await page
    .getByRole("button", { name: "Edit notes for Pride and Prejudice" })
    .click();
  const notes = page.getByLabel("Notes for Pride and Prejudice");
  await expect(notes).toBeVisible();
  const titleBox = await page
    .locator("tr", { hasText: "Pride and Prejudice" })
    .locator(".rowTitleBlock")
    .boundingBox();
  const notesBox = await notes.boundingBox();
  expect(titleBox).not.toBeNull();
  expect(notesBox).not.toBeNull();
  expect(Math.abs((titleBox?.width ?? 0) - (notesBox?.width ?? 0))).toBeLessThanOrEqual(
    2,
  );
  await capture(page, "library-notes-edit-desktop");
  await notes.press("Escape");

  await page.getByRole("button", { name: "Filter" }).click();
  const filterDialog = page.getByRole("dialog", { name: "Filter list" });
  await expect(filterDialog).toBeVisible();
  await capture(page, "library-filter-desktop");
  await filterDialog.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Sort" }).click();
  const sortDialog = page.getByRole("dialog", { name: "Sort list" });
  await expect(sortDialog.getByLabel("Sort by")).toHaveValue("updated");
  await expect(sortDialog.getByLabel("Direction")).toHaveValue("desc");
  await sortDialog.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Display settings" }).click();
  const displayDialog = page.getByRole("dialog", { name: "Display settings" });
  await expect(displayDialog).toBeVisible();
  await capture(page, "library-display-settings-desktop");
  await displayDialog.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Grid view" }).click();
  const grid = page.locator(".libraryGrid");
  await expect(grid).toBeVisible();
  const desktopColumns = await grid.evaluate(
    (element) => getComputedStyle(element).gridTemplateColumns.split(" ").length,
  );
  expect(desktopColumns).toBe(4);
  await capture(page, "library-grid-desktop");

  await page.reload();
  await expect(page.locator(".libraryGrid")).toBeVisible();
  await expect(page.getByRole("button", { name: "Grid view" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Table view" }).click();
  await expect(page.locator(".libraryTableWrap")).toBeVisible();

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
  await expect(page.getByLabel("Email for reader_ui")).toHaveValue(
    "reader-ui@example.com",
  );
  const userRow = page.locator("tr", { hasText: "reader_ui" });
  const resetBox = await userRow
    .getByRole("button", { name: "Reset password" })
    .boundingBox();
  const disableBox = await userRow
    .getByRole("button", { name: "Disable user" })
    .boundingBox();
  expect(resetBox).not.toBeNull();
  expect(disableBox).not.toBeNull();
  expect(Math.abs((resetBox?.width ?? 0) - (disableBox?.width ?? 0))).toBeLessThanOrEqual(
    2,
  );
  expect(
    Math.abs((resetBox?.height ?? 0) - (disableBox?.height ?? 0)),
  ).toBeLessThanOrEqual(2);
  await capture(page, "users-desktop");

  expect(diagnostics.consoleErrors).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);
  await writeFile(
    `${output}/desktop-diagnostics.json`,
    JSON.stringify(diagnostics, null, 2),
    "utf8",
  );
});

test("mobile viewport keeps dense table and two-column grid inside the page", async ({
  page,
}) => {
  const diagnostics = await prepare(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await expect(
    page.getByRole("link", { name: "Continue with central sign-in" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await capture(page, "login-mobile");

  await login(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  const brand = page.getByRole("link", { name: "media-list" });
  await expect(brand).toHaveCSS("white-space", "nowrap");
  const tabTops = await page
    .locator(".statusTabs a")
    .evaluateAll((links) =>
      links.map((link) => Math.round(link.getBoundingClientRect().top)),
    );
  expect(new Set(tabTops).size).toBe(1);
  await capture(page, "library-table-mobile");

  await page.getByRole("button", { name: "Grid view" }).click();
  const grid = page.locator(".libraryGrid");
  await expect(grid).toBeVisible();
  const mobileColumns = await grid.evaluate(
    (element) => getComputedStyle(element).gridTemplateColumns.split(" ").length,
  );
  expect(mobileColumns).toBe(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await capture(page, "library-grid-mobile");

  await page.reload();
  await expect(page.locator(".libraryGrid")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);

  await page.goto("/admin");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  const addUserBox = await page
    .getByRole("button", { name: "+ Add user" })
    .boundingBox();
  expect(addUserBox).not.toBeNull();
  expect(addUserBox?.width ?? 0).toBeGreaterThan(300);
  const readerCard = page.locator("tr", { hasText: "reader_ui" });
  for (const control of [
    readerCard.getByRole("button", { name: "Save" }),
    readerCard.getByRole("button", { name: "Reset password" }),
    readerCard.getByRole("button", { name: "Disable user" }),
  ]) {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.x ?? 999) + (box?.width ?? 999)).toBeLessThanOrEqual(390);
  }
  await capture(page, "users-mobile");

  expect(diagnostics.consoleErrors).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);
  await writeFile(
    `${output}/mobile-diagnostics.json`,
    JSON.stringify(diagnostics, null, 2),
    "utf8",
  );
});
