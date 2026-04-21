import { test, expect } from "@playwright/test";

test.describe("NOUS Station v2 smoke", () => {
  test("/ redirects to /chat", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("**/chat**");
    expect(page.url()).toContain("/chat");
  });

  test("chat page renders composer", async ({ page }) => {
    await page.goto("/chat");
    const composer = page.getByPlaceholder(/Message NOUS/);
    await expect(composer).toBeVisible();
  });

  test("slash menu opens on /", async ({ page }) => {
    await page.goto("/chat");
    const composer = page.getByPlaceholder(/Message NOUS/);
    await composer.fill("/recall");
    await expect(page.getByText("Search NOUS memory")).toBeVisible();
  });

  test("⌘K opens composer sheet on /boardroom", async ({ page }) => {
    await page.goto("/boardroom");
    await page.keyboard.press("Meta+k");
    // Composer sheet should appear
    const composer = page.getByPlaceholder(/Message NOUS/);
    await expect(composer).toBeVisible();
  });

  test("? opens keyboard help modal", async ({ page }) => {
    await page.goto("/chat");
    // Click outside textarea first to avoid input
    await page.click("body");
    await page.keyboard.press("?");
    await expect(page.getByText("Keyboard Shortcuts")).toBeVisible();
  });
});
