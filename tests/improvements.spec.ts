import { test, expect, type Page } from "@playwright/test";
async function nav(page: Page, name: string) {
  await page
    .getByRole("navigation")
    .getByRole("button", { name, exact: true })
    .click();
}
const card = (page: Page, name: string) =>
  page
    .locator(".account-cards .panel")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText(/Review build · fictional data only/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Explore fictional demo" }).click();
});
async function payBill(page: Page, amount: string) {
  await page
    .getByRole("button", { name: "Pay & record", exact: true })
    .first()
    .click();
  await page.getByLabel("Actual payment amount (USD)").fill(amount);
  await page
    .getByRole("button", { name: "Save bill payment", exact: true })
    .click();
}

test("partial bill payments, payment deletion/restoration, and manual unpaid retain consistent history", async ({
  page,
}) => {
  await nav(page, "Bills");
  await payBill(page, "30.00");
  await expect(page.locator(".bill-detail").first()).toContainText(
    "Partially paid",
  );
  await payBill(page, "35.00");
  await expect(page.locator(".bill-detail").first()).toContainText("Paid");
  await expect(page.locator(".bill-detail")).toHaveCount(2);
  await nav(page, "Transactions");
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Delete Demo · Internet", exact: true })
    .first()
    .click();
  await nav(page, "Bills");
  await expect(page.locator(".bill-detail").first()).toContainText(
    "Partially paid",
  );
  await nav(page, "Transactions");
  await page
    .getByRole("button", { name: "Restore transaction", exact: true })
    .click();
  await nav(page, "Bills");
  await expect(page.locator(".bill-detail").first()).toContainText(
    "Actual paid $65.00",
  );
  await page.getByRole("button", { name: "Mark unpaid", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Keep transactions; unlink bill",
      exact: true,
    })
    .click();
  await expect(page.locator(".bill-detail").first()).toContainText("Unpaid");
  await nav(page, "Transactions");
  await expect(
    page.getByRole("row").filter({ hasText: "Demo · Internet" }),
  ).toHaveCount(2);
});

test("recurring bill editing and deletion leave paid occurrences and their transactions intact", async ({
  page,
}) => {
  await nav(page, "Bills");
  await payBill(page, "65.00");
  await page
    .getByRole("button", { name: "Edit Demo · Internet bill", exact: true })
    .nth(1)
    .click();
  await page.getByLabel("Bill name").fill("Future Internet");
  await page.getByLabel("Expected amount (USD)").fill("80.00");
  await page
    .getByRole("combobox", { name: "Repeat", exact: true })
    .selectOption("weekly");
  await page.getByLabel("Apply changes to").selectOption("future");
  await page.getByRole("button", { name: "Save bill", exact: true }).click();
  await expect(
    page.locator(".bill-detail").filter({ hasText: "Future Internet" }),
  ).toContainText("weekly");
  page.once("dialog", (d) => d.accept());
  await page
    .locator(".bill-detail")
    .filter({ hasText: "Future Internet" })
    .getByRole("button", { name: "Delete this & future", exact: true })
    .click();
  await expect(page.locator(".bill-detail")).toHaveCount(1);
  await expect(page.locator(".bill-detail")).toContainText(
    "Actual paid $65.00",
  );
  await nav(page, "Transactions");
  await expect(
    page.getByRole("row").filter({ hasText: "Demo · Internet" }),
  ).toHaveCount(1);
});

test("loan payments and rates can be entered, edited, deleted and restored as one group", async ({
  page,
}, info) => {
  await nav(page, "Accounts");
  await page.getByRole("button", { name: "Add account", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Fictional car loan");
  await dialog.getByLabel("Account type").selectOption("debt");
  await dialog.getByLabel("Opening balance (USD)").fill("-5000.00");
  await dialog.getByLabel("Annual rate").fill("6.25");
  await dialog.getByLabel("Original loan amount").fill("9000.00");
  await dialog.getByLabel("Expected monthly loan payment").fill("250.00");
  await dialog.getByRole("button", { name: "Save account" }).click();
  await expect(dialog).toBeHidden();
  await expect(card(page, "Fictional car loan")).toContainText("APR: 6.25%");
  await card(page, "Fictional car loan")
    .getByRole("button", { name: "Record loan payment" })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Principal (USD)", { exact: true }).fill("250.00");
  await dialog.getByLabel("Interest (USD)", { exact: true }).fill("50.00");
  await dialog.getByRole("button", { name: "Save loan payment" }).click();
  await expect(dialog).toBeHidden();
  await expect(card(page, "Fictional car loan")).toContainText(
    "Remaining principal: $4,750.00",
  );
  await card(page, "Fictional car loan")
    .getByText("Loan payment history (1)")
    .click();
  await card(page, "Fictional car loan")
    .getByRole("button", { name: "Edit payment", exact: true })
    .click();
  await dialog.getByLabel("Principal (USD)", { exact: true }).fill("300.00");
  await dialog.getByRole("button", { name: "Save loan payment" }).click();
  await expect(dialog).toBeHidden();
  await expect(card(page, "Fictional car loan")).toContainText(
    "Remaining principal: $4,700.00",
  );
  await page.screenshot({
    path: `test-results/loans-${info.project.name}.png`,
    fullPage: true,
  });
  page.once("dialog", (d) => d.accept());
  await card(page, "Fictional car loan")
    .getByRole("button", { name: "Delete payment", exact: true })
    .click();
  await expect(card(page, "Fictional car loan")).toContainText(
    "Remaining principal: $5,000.00",
  );
  await nav(page, "Transactions");
  await page
    .getByRole("button", { name: "Restore transaction", exact: true })
    .click();
  await nav(page, "Accounts");
  await expect(card(page, "Fictional car loan")).toContainText(
    "Remaining principal: $4,700.00",
  );
  await nav(page, "Dashboard");
  await expect(
    page.locator(".stat").filter({ hasText: "MONTHLY SPENDING" }),
  ).toContainText("$170.50");
});

test("subcategories roll up, move and reassign transactions without changing history", async ({
  page,
}, info) => {
  await nav(page, "Budget");
  await page.getByRole("button", { name: "Add category", exact: true }).click();
  await page.getByLabel("Category name", { exact: true }).fill("Food");
  await page
    .getByRole("button", { name: "Save category", exact: true })
    .click();
  const groceries = page
    .locator("article.budget-edit")
    .filter({ has: page.locator("strong").filter({ hasText: /^Groceries$/ }) });
  await groceries
    .getByRole("button", { name: "Edit category", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Parent category", exact: true })
    .selectOption({ label: "Food" });
  await page
    .getByRole("button", { name: "Save category", exact: true })
    .click();
  const food = page
    .locator("article.budget-edit")
    .filter({ has: page.locator("strong").filter({ hasText: /^Food$/ }) });
  await expect(food).toContainText("Spent $78.50");
  await page.getByRole("button", { name: "Add category", exact: true }).click();
  await page
    .getByLabel("Category name", { exact: true })
    .fill("Fictional pantry");
  await page
    .getByRole("combobox", { name: "Parent category", exact: true })
    .selectOption({ label: "Food" });
  await page
    .getByRole("button", { name: "Save category", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Payee / description")
    .fill("Fictional pantry purchase");
  await dialog.getByLabel("Amount (USD)").fill("20.00");
  await dialog
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption({ label: "Fictional pantry" });
  await dialog.getByRole("button", { name: "Save transaction" }).click();
  await expect(food).toContainText("Spent $98.50");
  const child = page
    .locator("article.budget-edit")
    .filter({ hasText: "Fictional pantry" });
  await child
    .getByRole("button", { name: "Edit category", exact: true })
    .click();
  await page
    .getByLabel("Parent category")
    .selectOption({ label: "Transportation" });
  await page
    .getByRole("button", { name: "Save category", exact: true })
    .click();
  await expect(food).toContainText("Spent $78.50");
  await child
    .getByRole("button", { name: "Delete category", exact: true })
    .click();
  await child.getByLabel("Reassign to").selectOption({ label: "Groceries" });
  page.once("dialog", (d) => d.accept());
  await child
    .getByRole("button", { name: "Confirm category deletion" })
    .click();
  await expect(food).toContainText("Spent $98.50");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/subcategories-${info.project.name}.png`,
    fullPage: true,
  });
  await nav(page, "Transactions");
  await page
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption({ label: "Food" });
  await expect(
    page.getByRole("row").filter({ hasText: "Fictional pantry purchase" }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("row").filter({ hasText: "Demo · Green Market" }),
  ).toHaveCount(1);
});

test("CSV matching an existing bill payment adds no second expense", async ({
  page,
}) => {
  await nav(page, "Bills");
  await payBill(page, "65.00");
  const date = await page.evaluate(() =>
    new Intl.DateTimeFormat("en-CA").format(new Date()),
  );
  await page.getByRole("button", { name: "Import CSV", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Transaction CSV file").setInputFiles({
    name: "fictional-bill.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`Date,Description,Amount\n${date},Internet,-65.00`),
  });
  await dialog.getByRole("button", { name: "Preview transactions" }).click();
  await dialog.getByLabel("Import action for row 1").selectOption("existing");
  await dialog
    .getByLabel("Existing match for row 1")
    .selectOption({ index: 1 });
  await dialog.getByLabel("Link to bill for row 1").selectOption({ index: 1 });
  await dialog
    .getByRole("checkbox", { name: "Include row 1", exact: true })
    .check();
  await dialog.getByLabel("I reviewed the account").check();
  await dialog.getByRole("button", { name: "Import 1 transactions" }).click();
  await expect(dialog).toBeHidden();
  await nav(page, "Transactions");
  await expect(
    page.getByRole("row").filter({ hasText: "Demo · Internet" }),
  ).toHaveCount(1);
  await nav(page, "Bills");
  await expect(page.locator(".bill-detail").first()).toContainText(
    "Actual paid $65.00",
  );
});

test("rates persist and actual interest earned is recorded without adding estimates", async ({
  page,
}) => {
  await nav(page, "Accounts");
  await page
    .getByRole("button", { name: "Edit Rainy day savings account" })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Annual rate").fill("4.25");
  await dialog.getByRole("button", { name: "Save account" }).click();
  await expect(dialog).toBeHidden();
  await expect(card(page, "Rainy day savings")).toContainText("APY: 4.25%");
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Transaction type").selectOption("income");
  await dialog.getByLabel("Income source").fill("Fictional interest earned");
  await dialog.getByLabel("Amount (USD)").fill("2.50");
  await dialog
    .getByRole("combobox", { name: "Account", exact: true })
    .selectOption("savings");
  await dialog.getByLabel("Interest classification").selectOption("earned");
  await dialog.getByRole("button", { name: "Save transaction" }).click();
  await nav(page, "Dashboard");
  await expect(page.locator(".monthly-net")).toContainText(
    "interest earned: $2.50",
  );
  await page.reload();
  await page.getByRole("button", { name: "Explore fictional demo" }).click();
  await nav(page, "Accounts");
  await expect(card(page, "Rainy day savings")).toContainText("APY: 4.25%");
});
