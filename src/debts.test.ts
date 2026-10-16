import { test } from "node:test";
import assert from "node:assert/strict";
import { empty, demo, validate, balance, type Data } from "./ledger";
import {
  trackedDebts,
  debtBalance,
  debtSummary,
  trackCreditCard,
} from "./debts";
import { recordBillPayment, saveLoanPayment, billStatus } from "./planning";
import { planAccountDeletion } from "./accountDeletion";
function setup(): Data {
  const d = empty();
  d.accounts = [
    {
      id: "cash",
      name: "Checking",
      type: "checking",
      opening: 100000,
      date: "2026-01-01",
    },
    {
      id: "loan",
      name: "Car loan",
      type: "debt",
      opening: -500000,
      date: "2026-01-01",
    },
    {
      id: "card",
      name: "Discover",
      type: "credit",
      opening: -80000,
      date: "2026-01-01",
    },
  ];
  return d;
}
test("loans are shown by default and credit cards are individually opt-in", () => {
  const d = setup(),
    before = JSON.stringify(d);
  assert.deepEqual(
    trackedDebts(d).map((a) => a.id),
    ["loan"],
  );
  const included = trackCreditCard(d, "card", true);
  assert.deepEqual(
    trackedDebts(included).map((a) => a.id),
    ["loan", "card"],
  );
  assert.equal(JSON.stringify(d), before);
  assert.equal(included.accounts, d.accounts);
  assert.equal(included.transactions, d.transactions);
  assert.deepEqual(
    trackedDebts(trackCreditCard(included, "card", false)).map((a) => a.id),
    ["loan"],
  );
  assert.throws(() => trackCreditCard(d, "cash", true), /credit card/);
});
test("remaining balances come from the existing ledger, not a duplicate debt record", () => {
  let d = setup();
  d = saveLoanPayment(d, {
    loan: "loan",
    account: "cash",
    date: "2026-01-10",
    principal: 25000,
    interest: 5000,
    category: d.categories[0].id,
  });
  assert.equal(debtSummary(d, d.accounts[1]).owed, 475000);
  assert.equal(debtSummary(d, d.accounts[1]).principal, 475000);
  assert.equal(balance(d.accounts[0], d.transactions), 70000);
  assert.equal(d.accounts[1].opening, -500000);
});
test("card overpayments show a credit and never make total debt negative", () => {
  const d = setup();
  d.transactions = [
    {
      id: "payment",
      date: "2026-01-10",
      amount: 90000,
      type: "transfer",
      account: "cash",
      to: "card",
      category: "",
      payee: "Payment",
      notes: "",
    },
  ];
  assert.equal(debtBalance(d, d.accounts[2]), 0);
  assert.equal(debtSummary(d, d.accounts[2]).credit, 10000);
});
test("next due payment includes overdue/partial occurrences and excludes completed payments", () => {
  let d = setup();
  d.bills = [
    {
      id: "first",
      name: "Card payment",
      account: "cash",
      loanAccount: "card",
      date: "2026-01-10",
      amount: 10000,
      category: d.categories[0].id,
      frequency: "monthly",
      anchor: 10,
    },
  ];
  d = recordBillPayment(d, "first", 3000, "2026-01-10");
  assert.equal(billStatus(d, d.bills[0]), "Partially paid");
  assert.equal(debtSummary(d, d.accounts[2]).next?.id, "first");
  d = recordBillPayment(d, "first", 7000, "2026-01-10");
  assert.equal(debtSummary(d, d.accounts[2]).next?.date, "2026-02-10");
  assert.equal(debtSummary(d, d.accounts[2]).owed, 70000);
});
test("credit-card visibility survives serialization and deleting the card cleans its preference", () => {
  let d = trackCreditCard(setup(), "card", true);
  d = JSON.parse(JSON.stringify(d));
  validate(d);
  assert.equal(trackedDebts(d).length, 2);
  const next = planAccountDeletion(d, "card").next;
  validate(next);
  assert.deepEqual(next.debtPreferences?.creditAccountIds, []);
  assert.equal(trackedDebts(next).length, 1);
});
test("invalid card preferences cannot be saved and legacy data stays valid", () => {
  const d = demo();
  validate(d);
  assert.deepEqual(trackedDebts(d), []);
  assert.throws(
    () =>
      validate({ ...d, debtPreferences: { creditAccountIds: ["checking"] } }),
    /tracked credit/,
  );
  assert.throws(
    () =>
      validate({
        ...d,
        debtPreferences: { creditAccountIds: ["card", "card"] },
      }),
    /tracked credit/,
  );
});
