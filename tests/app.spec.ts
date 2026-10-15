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
  await page.getByRole("button", { name: "Save bill payment" }).click();
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

test("SoFi Relay CSV previews one source account, saves and skips a re-import", async ({
  page,
}, info) => {
  const date = await page.evaluate(() =>
    new Intl.DateTimeFormat("en-CA").format(new Date()),
  );
  const csv =
    "Authorized Date,Posted Date,Status,Account Name,Description,Primary Category,Detailed Category,Amount\n" +
    `${date},${date},Posted,SoFi Checking,Fictional imported market,Food,Groceries,-12.34\n${date},${date},Posted,SoFi Savings,Do not import this account,Income,Interest,2.00`;
  const upload = async () => {
    await page.getByRole("button", { name: "Import CSV", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Transaction CSV file").setInputFiles({
      name: "fictional-sofi.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
    await dialog
      .getByLabel("Source account in file")
      .selectOption("SoFi Checking");
    await dialog.getByLabel("Save into app account").selectOption("checking");
    await dialog.getByRole("button", { name: "Preview transactions" }).click();
    return dialog;
  };
  let dialog = await upload();
  await expect(
    dialog.getByText("Fictional imported market", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Do not import this account", { exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Import 1 transactions" }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/import-${info.project.name}.png`,
    fullPage: true,
  });
  await dialog.getByLabel("I reviewed the account").check();
  await dialog.getByRole("button", { name: "Import 1 transactions" }).click();
  await expect(dialog).toBeHidden();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Transactions", exact: true })
    .click();
  await expect(
    page.getByRole("row").filter({ hasText: "Fictional imported market" }),
  ).toContainText("$12.34");
  dialog = await upload();
  await expect(
    dialog.getByRole("checkbox", { name: "Include row 1", exact: true }),
  ).not.toBeChecked();
  await expect(dialog.getByText(/Possible duplicate/)).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Import 0 transactions" }),
  ).toBeDisabled();
});

test("CSV transfer review uses the other account and does not add spending", async ({
  page,
}) => {
  const date = await page.evaluate(() =>
    new Intl.DateTimeFormat("en-CA").format(new Date()),
  );
  await page.getByRole("button", { name: "Import CSV", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Transaction CSV file").setInputFiles({
    name: "fictional-transfer.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`Date,Description,Amount\n${date},Card payment,-33.00`),
  });
  await dialog.getByRole("button", { name: "Preview transactions" }).click();
  await expect(
    dialog.getByRole("checkbox", { name: "Include row 1", exact: true }),
  ).not.toBeChecked();
  await dialog.getByLabel("Other account for row 1").selectOption("card");
  await dialog
    .getByRole("checkbox", { name: "Include row 1", exact: true })
    .check();
  await dialog.getByLabel("I reviewed the account").check();
  await dialog.getByRole("button", { name: "Import 1 transactions" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.locator(".stat").filter({ hasText: "MONTHLY SPENDING" }),
  ).toContainText("$120.50");
  await expect(
    page.locator(".account-row").filter({ hasText: "Everyday credit card" }),
  ).toContainText("-$257.00");
});

test("account opening balance can be corrected before historical import", async ({
  page,
}) => {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Accounts", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit Everyday checking account" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue(
    "Everyday checking",
  );
  await dialog.getByLabel("Opening balance date").fill("2020-01-01");
  await dialog.getByLabel("Opening balance (USD)").fill("100.00");
  page.once("dialog", (d) => d.accept());
  await dialog.getByRole("button", { name: "Save account" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page
      .locator(".account-cards .panel")
      .filter({ hasText: "Everyday checking" }),
  ).toContainText("Opening $100.00 on 2020-01-01");
});

test("account deletion requires typed confirmation, cancels safely and persists transfer cleanup", async ({
  page,
}, info) => {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Accounts", exact: true })
    .click();
  const open = () =>
    page
      .getByRole("button", { name: "Delete Rainy day savings account" })
      .click();
  await open();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("1 linked transactions");
  await expect(dialog).toContainText("Everyday checking");
  await expect(
    dialog.getByRole("button", { name: "Permanently delete account" }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Delete Rainy day savings account" }),
  ).toBeVisible();
  await open();
  await dialog
    .getByLabel("Type the account name to confirm")
    .fill("wrong name");
  await dialog.getByLabel("I understand that linked data").check();
  await expect(
    dialog.getByRole("button", { name: "Permanently delete account" }),
  ).toBeDisabled();
  await page.screenshot({
    path: `test-results/delete-account-${info.project.name}.png`,
    fullPage: true,
  });
  await dialog
    .getByLabel("Type the account name to confirm")
    .fill("Rainy day savings");
  await dialog
    .getByRole("button", { name: "Permanently delete account" })
    .click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Rainy day savings", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Dashboard", exact: true })
    .click();
  await expect(
    page.locator(".account-row").filter({ hasText: "Everyday checking" }),
  ).toContainText("$5,616.50");
  await expect(
    page.locator(".stat").filter({ hasText: "MONTHLY SPENDING" }),
  ).toContainText("$120.50");
  await page.reload();
  await page.getByRole("button", { name: "Explore fictional demo" }).click();
  await expect(
    page.locator(".account-row").filter({ hasText: "Rainy day savings" }),
  ).toHaveCount(0);
});

test("failed deletion preserves the account and reports the storage error", async ({
  page,
}) => {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Accounts", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete Rainy day savings account" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Type the account name to confirm")
    .fill("Rainy day savings");
  await dialog.getByLabel("I understand that linked data").check();
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error("Storage unavailable");
    };
  });
  await dialog
    .getByRole("button", { name: "Permanently delete account" })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Storage unavailable");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Rainy day savings", exact: true }),
  ).toBeVisible();
});
