import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore fictional demo" }).click();
  await expect(
    page.getByRole("heading", { name: "A little clarity for your day." }),
  ).toBeVisible();
});
test("dashboard, navigation and phone layout", async ({ page }, info) => {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/dashboard-${info.project.name}.png`,
    fullPage: true,
  });
  for (const p of [
    "Transactions",
    "Budget",
    "Bills",
    "Accounts",
    "Savings",
    "Settings",
  ]) {
    await page
      .getByRole("navigation")
      .getByRole("button", { name: p, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: p, exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: `test-results/settings-dark-${info.project.name}.png`,
    fullPage: true,
  });
});
test("expense persists across refresh and sign-out; edit and delete recalculate", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Payee / description").fill("Test weekly groceries");
  await dialog.getByLabel("Amount (USD)").fill("50.00");
  await dialog.getByLabel("Category").selectOption({ label: "Groceries" });
  await dialog.getByRole("button", { name: "Save transaction" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("status")).toContainText("Saved");
  await page.reload();
  await page.getByRole("button", { name: "Explore fictional demo" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Transactions", exact: true })
    .click();
  await expect(
    page.getByText("Test weekly groceries", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit Test weekly groceries" })
    .click();
  await dialog.getByLabel("Amount (USD)").fill("75.00");
  await dialog.getByRole("button", { name: "Save transaction" }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "Test weekly groceries" }),
  ).toContainText("$75.00");
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Delete Test weekly groceries" })
    .click();
  await expect(
    page.getByText("Test weekly groceries", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Sign out", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Explore fictional demo" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Explore fictional demo" }).click();
  await expect(
    page.getByText("Test weekly groceries", { exact: true }),
  ).toHaveCount(0);
});
test("bill payment records one expense and next monthly occurrence remains unpaid", async ({
  page,
}) => {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Bills", exact: true })
    .click();
  page.on("dialog", (d) => d.accept(d.defaultValue()));
  await page.getByRole("button", { name: "Pay & record" }).click();
  await expect(page.getByRole("button", { name: "Pay & record" })).toHaveCount(
    1,
  );
  await expect(
    page.getByText(/monthly · Everyday checking · Paid/),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Transactions", exact: true })
    .click();
  await expect(
    page.getByRole("row").filter({ hasText: "Demo · Internet" }),
  ).toHaveCount(1);
});

test("failed persistence keeps the form open and never claims success", async ({
  page,
}) => {
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error("Storage is full");
    };
  });
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Payee / description").fill("Unsaved purchase");
  await dialog.getByLabel("Amount (USD)").fill("50.00");
  await dialog.getByRole("button", { name: "Save transaction" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText("Storage is full");
  await expect(page.getByRole("status")).toHaveCount(0);
});
