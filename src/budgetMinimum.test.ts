import { test } from "node:test";
import assert from "node:assert/strict";
import { empty, totals, type Data } from "./ledger";
import {
  categoryLimit,
  scheduledMinimum,
  totalBudget,
  categoryBudgetUsed,
  recordBillPayment,
  saveLoanPayment,
  deleteBill,
} from "./planning";
function fixture(): Data {
  return {
    ...empty(),
    categories: [
      { id: "housing", name: "Housing", limit: 0 },
      { id: "loan", name: "Debt", limit: 0 },
    ],
    accounts: [
      {
        id: "cash",
        name: "Checking",
        type: "checking",
        opening: 1000000,
        date: "2026-01-01",
      },
      {
        id: "debt",
        name: "Loan",
        type: "debt",
        opening: -500000,
        date: "2026-01-01",
      },
    ],
    bills: [
      {
        id: "rent",
        name: "Rent",
        date: "2026-01-31",
        anchor: 31,
        frequency: "monthly",
        amount: 10000,
        account: "cash",
        category: "housing",
      },
    ],
  };
}
test("scheduled floor follows recurrence, survives payment, and permits a larger manual envelope", () => {
  let d = fixture();
  assert.equal(categoryLimit(d, "2026-02", "housing"), 10000);
  d = recordBillPayment(d, "rent", 10000, "2026-01-31");
  assert.equal(scheduledMinimum(d, "2026-02", "housing"), 10000);
  assert.equal(categoryLimit(d, "2026-01", "housing"), 10000);
  assert.equal(categoryBudgetUsed(d, "2026-01", "housing"), 10000);
  d.budgets["2026-01"] = { housing: 15000 };
  assert.equal(categoryLimit(d, "2026-01", "housing"), 15000);
  d.budgets["2026-01"].housing = 1;
  assert.equal(categoryLimit(d, "2026-01", "housing"), 10000);
});
test("weekly and one-time bills sum only in their due month; deleting lowers the floor", () => {
  let d = fixture();
  d.bills[0] = {
    ...d.bills[0],
    date: "2026-02-01",
    frequency: "weekly",
    amount: 1000,
  };
  d.bills.push({
    ...d.bills[0],
    id: "once",
    date: "2026-02-02",
    frequency: "once",
    amount: 500,
  });
  assert.equal(scheduledMinimum(d, "2026-02", "housing"), 4500);
  assert.equal(scheduledMinimum(d, "2026-01", "housing"), 0);
  d = deleteBill(d, "once", "one");
  assert.equal(scheduledMinimum(d, "2026-02", "housing"), 4000);
});
test("parent envelopes cover child limits plus direct schedules exactly once", () => {
  const d = fixture();
  d.categories.push({
    id: "child",
    name: "Child",
    limit: 2000,
    parentId: "housing",
  });
  d.bills.push({
    ...d.bills[0],
    id: "childbill",
    category: "child",
    frequency: "once",
    amount: 3000,
  });
  d.budgets["2026-01"] = { housing: 100 };
  assert.equal(categoryLimit(d, "2026-01", "housing"), 13000);
  assert.equal(totalBudget(d, "2026-01"), 13000);
});
test("loan principal and interest consume budget once while reports count only interest", () => {
  let d = fixture();
  d.bills = [
    {
      ...d.bills[0],
      id: "payment",
      category: "loan",
      loanAccount: "debt",
      amount: 30000,
    },
  ];
  d = saveLoanPayment(d, {
    loan: "debt",
    account: "cash",
    date: "2026-01-31",
    principal: 25000,
    interest: 5000,
    category: "loan",
    billId: "payment",
  });
  assert.equal(categoryBudgetUsed(d, "2026-01", "loan"), 30000);
  assert.equal(categoryLimit(d, "2026-01", "loan"), 30000);
  assert.equal(totals(d.transactions, "2026-01").spent, 5000);
});

test("partial card payments use only linked transfers and keep full scheduled minimum", () => {
  let d = fixture();
  d.accounts.push({
    id: "card",
    name: "Card",
    type: "credit",
    opening: -50000,
    date: "2026-01-01",
  });
  d.bills = [
    {
      ...d.bills[0],
      id: "cardbill",
      category: "loan",
      loanAccount: "card",
      amount: 10000,
    },
  ];
  d = recordBillPayment(d, "cardbill", 4000, "2026-01-30");
  d.transactions.push({
    id: "unlinked",
    date: "2026-01-30",
    amount: 1000,
    account: "cash",
    to: "card",
    type: "transfer",
    category: "",
    payee: "Card",
    notes: "",
  });
  assert.equal(categoryBudgetUsed(d, "2026-01", "loan"), 4000);
  assert.equal(categoryLimit(d, "2026-01", "loan"), 10000);
  assert.equal(totals(d.transactions, "2026-01").spent, 0);
});
