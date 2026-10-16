import { test, expect } from "@playwright/test";
import { demo } from "../src/ledger";
test("scheduled minimum supports extra budget, rejects smaller limits and persists", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore fictional demo" }).click();
  await page.evaluate((data) => {
    const key = "hearth-fictional-review-v1";
    const bill = data.bills[0];
    bill.amount = 98765;
    const category = data.categories.find(
      (c: { id: string }) => c.id === bill.category,
    );
    category.name = "Scheduled test";
    category.limit = 0;
    data.bills = [bill];
    data.budgets = {};
    localStorage.setItem(key, JSON.stringify(data));
  }, demo());
  await page.reload();
  await page.getByRole("button", { name: "Explore fictional demo" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Budget", exact: true })
    .click();
  const row = page
    .locator(".budget-edit")
    .filter({ hasText: "Scheduled test" });
  await expect(row).toContainText("Scheduled minimum $987.65");
  await row.getByLabel("Limit for Scheduled test").fill("10");
  await row.getByRole("button", { name: "Save limit" }).click();
  await expect(page.getByRole("alert")).toContainText("at least $987.65");
  await row.getByLabel("Limit for Scheduled test").fill("1100");
  await row.getByRole("button", { name: "Save limit" }).click();
  await expect(row.getByLabel("Limit for Scheduled test")).toHaveValue(
    "1100.00",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/budget-minimum-${info.project.name}.png`,
    fullPage: true,
  });
  await page.reload();
  await page.getByRole("button", { name: "Explore fictional demo" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Budget", exact: true })
    .click();
  await expect(page.getByLabel("Limit for Scheduled test")).toHaveValue(
    "1100.00",
  );
});
