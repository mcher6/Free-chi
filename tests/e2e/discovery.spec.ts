import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
});

test("discovers, filters, saves, and opens a Chicago event", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /Your plans are on us/i }),
  ).toBeVisible();
  await expect(page.locator(".leaflet-map")).toBeVisible();
  await expect(page.getByText(/events found/i)).toBeVisible();
  await expect(page.getByText("Demo data").first()).toBeVisible();
  await expect(page.getByText(/mi away/i)).toHaveCount(0);

  await page.getByRole("checkbox", { name: /Free stuff/i }).check();
  await expect(page).toHaveURL(/freeStuff=true/);
  await expect(page.getByText(/events found/i)).toBeVisible();

  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page).toHaveURL(/view=list/);
  const firstCard = page.locator("article.event-card").first();
  await expect(firstCard).toBeVisible();
  await firstCard.getByRole("button", { name: /^Save / }).click();

  await page.getByRole("link", { name: /Saved/i }).first().click();
  await expect(page.getByRole("heading", { name: "Saved for later." })).toBeVisible();
  await expect(page.locator("article.event-card")).toHaveCount(1);

  await page.locator("article.event-card h3").first().click();
  await expect(page.getByText(/clearly labeled demo content/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "What the radar detected" })).toBeVisible();

  const id = page.url().split("/").at(-1);
  expect(id).toBeTruthy();
  const calendar = await page.request.get(`/api/events/${id}/calendar`);
  expect(calendar.ok()).toBeTruthy();
  expect(calendar.headers()["content-type"]).toContain("text/calendar");
  expect(await calendar.text()).toContain("BEGIN:VCALENDAR");
});

test("calendar view and public API pagination remain shareable", async ({ page, request }) => {
  await page.goto("/?view=calendar&neighborhood=Loop");
  await expect(page.getByRole("button", { name: "Calendar", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: /What’s happening, day by day/i })).toBeVisible();

  const response = await request.get("/api/events?page=1&pageSize=2&freeOnly=true&sort=soonest");
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { events: unknown[]; pageSize: number; total: number };
  expect(body.pageSize).toBe(2);
  expect(body.events.length).toBeLessThanOrEqual(2);
  expect(body.total).toBeGreaterThan(2);
});
