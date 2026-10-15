import { test } from "node:test";
import assert from "node:assert/strict";
import { demo, empty, balance, totals, validate, today } from "./ledger";
import { planAccountDeletion } from "./accountDeletion";

test("delete savings removes both transfer legs, preserves unrelated spending, and does not mutate input", () => {
  const d = demo(),
    before = JSON.stringify(d),
    month = today().slice(0, 7);
  const plan = planAccountDeletion(d, "savings");
  assert.equal(plan.transactions.length, 1);
  assert.equal(plan.affectedAccounts[0].id, "checking");
  assert.equal(
    plan.next.accounts.some((a) => a.id === "savings"),
    false,
  );
  assert.equal(
    balance(
      plan.next.accounts.find((a) => a.id === "checking")!,
      plan.next.transactions,
    ),
    balance(d.accounts[0], d.transactions) + 25000,
  );
  assert.deepEqual(
    totals(plan.next.transactions, month),
    totals(d.transactions, month),
  );
  assert.equal(JSON.stringify(d), before);
  validate(plan.next);
});
test("delete source account removes linked income, expenses, transfers and bill occurrences", () => {
  const d = demo(),
    plan = planAccountDeletion(d, "checking");
  assert.equal(plan.transactions.length, 3);
  assert.equal(plan.bills.length, 1);
  assert.equal(plan.next.transactions.length, 1);
  assert.equal(plan.next.transactions[0].account, "card");
  assert.equal(plan.next.bills.length, 0);
  assert.equal(
    balance(
      plan.next.accounts.find((a) => a.id === "savings")!,
      plan.next.transactions,
    ),
    580000,
  );
  validate(plan.next);
});
test("retained bills lose payment links when their payment is removed", () => {
  const d = demo();
  const expense = d.transactions.find(
    (t) => t.type === "expense" && t.account === "checking",
  )!;
  d.bills.push({
    ...d.bills[0],
    id: "retained",
    account: "savings",
    paidTransaction: expense.id,
  });
  const plan = planAccountDeletion(d, "checking");
  assert.equal(plan.reopenedBills.length, 1);
  assert.equal(plan.next.bills[0].paidTransaction, undefined);
  assert.equal(d.bills[1].paidTransaction, expense.id);
  validate(plan.next);
});
test("last empty account can be removed and nonexistent accounts are rejected", () => {
  const d = empty();
  d.accounts = [
    {
      id: "only",
      name: "Unused account",
      type: "checking",
      opening: 10000,
      date: today(),
    },
  ];
  assert.equal(planAccountDeletion(d, "only").next.accounts.length, 0);
  assert.throws(() => planAccountDeletion(d, "missing"), /no longer exists/);
});
