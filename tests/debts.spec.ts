import { test, expect, type Page } from "@playwright/test";
async function nav(page: Page, name: string) {
  await page
    .getByRole("navigation")
    .getByRole("button", { name, exact: true })
    .click();
}
const debt = (page: Page, name: string) =>
  page
    .locator(".debt-card")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore fictional demo" }).click();
  await nav(page, "Debts");
});
test("cards are optional and card payments use transfers without extra spending", async ({
  page,
}, info) => {
  await expect(
    page.getByRole("heading", { name: "Debts", exact: true }),
  ).toBeVisible();
  await expect(debt(page, "Everyday credit card")).toHaveCount(0);
  await page.getByText("Credit cards (optional)", { exact: true }).click();
  await page.getByLabel("Show Everyday credit card in Debts").check();
  await expect(debt(page, "Everyday credit card")).toContainText(
    "Remaining balance$290.00",
  );
  await debt(page, "Everyday credit card")
    .getByRole("button", { name: "Record card payment" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Transaction type")).toHaveValue("transfer");
  await expect(dialog.getByLabel("To account")).toHaveValue("card");
  await expect(dialog.getByLabel("From account")).toHaveValue("checking");
  await dialog.getByLabel("Amount (USD)").fill("40.00");
  await dialog.getByRole("button", { name: "Save transaction" }).click();
  await expect(dialog).toBeHidden();
  await expect(debt(page, "Everyday credit card")).toContainText("$250.00");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/debts-cards-${info.project.name}.png`,
    fullPage: true,
  });
  await nav(page, "Dashboard");
  await expect(
    page.locator(".stat").filter({ hasText: "MONTHLY SPENDING" }),
  ).toContainText("$120.50");
  await page.reload();
  await page.getByRole("button", { name: "Explore fictional demo" }).click();
  await nav(page, "Debts");
  await expect(debt(page, "Everyday credit card")).toContainText("$250.00");
  await page.getByText("Credit cards (optional)", { exact: true }).click();
  await page.getByLabel("Show Everyday credit card in Debts").uncheck();
  await expect(debt(page, "Everyday credit card")).toHaveCount(0);
  await nav(page, "Accounts");
  await expect(
    page.getByRole("heading", { name: "Everyday credit card", exact: true }),
  ).toBeVisible();
});
test("a debt schedule updates the existing loan balance and stays out of ordinary bills", async ({
  page,
}, info) => {
  await page.getByRole("button", { name: "Add debt", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Account type")).toHaveValue("debt");
  await dialog.getByLabel("Name", { exact: true }).fill("Fictional auto loan");
  await dialog.getByLabel("Opening balance (USD)").fill("-5000");
  await dialog.getByLabel("Annual rate").fill("6.25");
  await dialog.getByRole("button", { name: "Save debt" }).click();
  await expect(dialog).toBeHidden();
  await expect(debt(page, "Fictional auto loan")).toContainText("$5,000.00");
  await page
    .getByRole("button", { name: "Add debt payment schedule", exact: true })
    .click();
  await page.getByLabel("Payment schedule name").fill("Fictional auto payment");
  await page.getByLabel("Expected amount (USD)").fill("300");
  await page
    .getByRole("combobox", { name: "Repeat", exact: true })
    .selectOption("monthly");
  await page.getByRole("button", { name: "Save payment schedule" }).click();
  await expect(page.locator(".bill-detail")).toContainText(
    "Fictional auto payment",
  );
  await nav(page, "Bills");
  await expect(
    page.locator(".bill-detail").filter({ hasText: "Fictional auto payment" }),
  ).toHaveCount(0);
  await expect(
    page.locator(".bill-detail").filter({ hasText: "Demo · Internet" }),
  ).toHaveCount(1);
  await nav(page, "Debts");
  await page.getByRole("button", { name: "Pay & record", exact: true }).click();
  await page.getByLabel("Principal (USD)", { exact: true }).fill("250");
  await page.getByLabel("Interest (USD)", { exact: true }).fill("50");
  await page.getByRole("button", { name: "Save loan payment" }).click();
  await expect(debt(page, "Fictional auto loan")).toContainText(
    "Remaining balance$4,750.00",
  );
  await expect(page.locator(".bill-detail").first()).toContainText(
    "Actual paid $300.00",
  );
  await expect(debt(page, "Fictional auto loan")).toContainText(
    "Loan payment history (1)",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/debts-loan-${info.project.name}.png`,
    fullPage: true,
  });
  await nav(page, "Accounts");
  await expect(
    page
      .locator(".account-cards .panel")
      .filter({ hasText: "Fictional auto loan" }),
  ).toContainText("Remaining principal: $4,750.00");
});
test("adding a card from Debts opts it in and a failed preference save preserves state", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Add debt", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Account type").selectOption("credit");
  await dialog.getByLabel("Name", { exact: true }).fill("Fictional Amex");
  await dialog.getByLabel("Opening balance (USD)").fill("-100");
  await dialog.getByRole("button", { name: "Save debt" }).click();
  await expect(dialog).toBeHidden();
  await expect(debt(page, "Fictional Amex")).toContainText("$100.00");
  await page.getByText("Credit cards (optional)", { exact: true }).click();
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw Error("Storage unavailable");
    };
  });
  await page.getByLabel("Show Everyday credit card in Debts").click();
  await expect(page.getByRole("alert")).toContainText("Storage unavailable");
  await expect(debt(page, "Everyday credit card")).toHaveCount(0);
  await expect(
    page.getByLabel("Show Everyday credit card in Debts"),
  ).not.toBeChecked();
});

test("existing bill schedules can be associated with a debt without losing dashboard alerts", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Add debt", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Name", { exact: true })
    .fill("Fictional existing loan");
  await dialog.getByLabel("Opening balance (USD)").fill("-1000");
  await dialog.getByRole("button", { name: "Save debt" }).click();
  await nav(page, "Bills");
  await page
    .getByRole("button", { name: "Edit Demo · Internet bill", exact: true })
    .click();
  await page
    .getByLabel("Tracked loan or credit card payment")
    .selectOption({ label: "Fictional existing loan" });
  await page.getByRole("button", { name: "Save bill", exact: true }).click();
  await expect(
    page.locator(".bill-detail").filter({ hasText: "Demo · Internet" }),
  ).toHaveCount(0);
  await nav(page, "Debts");
  await expect(
    page.locator(".bill-detail").filter({ hasText: "Demo · Internet" }),
  ).toHaveCount(1);
  await expect(debt(page, "Fictional existing loan")).toContainText(
    "$1,000.00",
  );
  await nav(page, "Dashboard");
  await expect(
    page.locator(".bill-row").filter({ hasText: "Demo · Internet" }),
  ).toHaveCount(1);
});

test("hiding an optional card keeps its existing schedule visible in Bills", async ({
  page,
}) => {
  await page.getByText("Credit cards (optional)", { exact: true }).click();
  await page.getByLabel("Show Everyday credit card in Debts").check();
  await page
    .getByRole("button", { name: "Add debt payment schedule", exact: true })
    .click();
  await page
    .getByLabel("Payment schedule name")
    .fill("Fictional card schedule");
  await page.getByLabel("Expected amount (USD)").fill("40");
  await page.getByRole("button", { name: "Save payment schedule" }).click();
  await nav(page, "Bills");
  await expect(
    page.locator(".bill-detail").filter({ hasText: "Fictional card schedule" }),
  ).toHaveCount(0);
  await nav(page, "Debts");
  await page.getByText("Credit cards (optional)", { exact: true }).click();
  await page.getByLabel("Show Everyday credit card in Debts").uncheck();
  await nav(page, "Bills");
  await expect(
    page.locator(".bill-detail").filter({ hasText: "Fictional card schedule" }),
  ).toHaveCount(1);
});
