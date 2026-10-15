import { test } from "node:test";
import assert from "node:assert/strict";
import {
  balance,
  cents,
  totals,
  spent,
  nextMonthly,
  validate,
  type Account,
  type Transaction,
  type Data,
} from "./ledger";
const accounts: Account[] = [
  {
    id: "checking",
    name: "Checking",
    type: "checking",
    opening: 100000,
    date: "2026-01-01",
  },
  {
    id: "savings",
    name: "Savings",
    type: "savings",
    opening: 50000,
    date: "2026-01-01",
  },
  { id: "card", name: "Card", type: "credit", opening: 0, date: "2026-01-01" },
];
const tx = (patch: Partial<Transaction>): Transaction => ({
  id: crypto.randomUUID(),
  date: "2026-02-15",
  amount: 5000,
  type: "expense",
  account: "checking",
  category: "groceries",
  payee: "Market",
  notes: "",
  ...patch,
});
test("money parses decimal dollars without floating point rounding", () => {
  assert.equal(cents("0.29"), 29);
  assert.equal(cents("100.01"), 10001);
  assert.equal(cents("-25.10"), -2510);
  for (const s of ["1.001", "NaN", "1e3", "", "Infinity"])
    assert.throws(() => cents(s));
});
test("$50 groceries reduces account balance and remaining grocery budget by $50", () => {
  const ts = [tx({})];
  assert.equal(balance(accounts[0], ts), 95000);
  assert.equal(20000 - spent(ts, "2026-02", "groceries"), 15000);
  assert.deepEqual(totals(ts, "2026-02"), { income: 0, spent: 5000 });
});
test("card purchase and payment count spending exactly once", () => {
  const purchase = tx({ account: "card" });
  const payment = tx({ type: "transfer", to: "card", category: "" });
  assert.equal(balance(accounts[2], [purchase]), -5000);
  assert.equal(balance(accounts[2], [purchase, payment]), 0);
  assert.equal(balance(accounts[0], [purchase, payment]), 95000);
  assert.equal(totals([purchase, payment], "2026-02").spent, 5000);
});
test("savings transfer changes balances with no income or spending", () => {
  const ts = [tx({ type: "transfer", to: "savings", category: "" })];
  assert.equal(balance(accounts[0], ts), 95000);
  assert.equal(balance(accounts[1], ts), 55000);
  assert.deepEqual(totals(ts, "2026-02"), { income: 0, spent: 0 });
});
test("refund reverses spending and increases balance", () => {
  const ts = [tx({}), tx({ type: "refund", amount: 2000 })];
  assert.equal(balance(accounts[0], ts), 97000);
  assert.equal(spent(ts, "2026-02", "groceries"), 3000);
});
test("opening balances are not income; monthly reporting excludes other months", () => {
  assert.deepEqual(totals([], "2026-02"), { income: 0, spent: 0 });
  assert.equal(
    totals(
      [tx({ type: "income", amount: 200000 }), tx({ date: "2026-03-01" })],
      "2026-02",
    ).spent,
    0,
  );
});
test("editing and deleting recompute balances instead of accumulating drift", () => {
  const t = tx({});
  assert.equal(balance(accounts[0], [{ ...t, amount: 7500 }]), 92500);
  assert.equal(balance(accounts[0], []), 100000);
});
test("monthly recurrences clamp short months and preserve original day", () => {
  assert.equal(nextMonthly("2026-01-31", 31), "2026-02-28");
  assert.equal(nextMonthly("2026-02-28", 31), "2026-03-31");
  assert.equal(nextMonthly("2028-01-31", 31), "2028-02-29");
  assert.equal(nextMonthly("2026-12-31", 31), "2027-01-31");
});
test("reject same-account transfers and transactions before opening balances", () => {
  const d: Data = {
    accounts,
    transactions: [],
    categories: [{ id: "groceries", name: "Groceries", limit: 20000 }],
    bills: [],
    budgets: {},
  };
  assert.throws(() =>
    validate({
      ...d,
      transactions: [tx({ type: "transfer", to: "checking" })],
    }),
  );
  assert.throws(() =>
    validate({ ...d, transactions: [tx({ date: "2025-01-01" })] }),
  );
  assert.throws(() => validate({ ...d, transactions: [tx({ amount: 0 })] }));
});
test("principal transfer and interest expense keep debt and spending accurate", () => {
  const a = { ...accounts[2], opening: -100000 };
  const ts = [
    tx({ type: "transfer", to: "card", amount: 10000 }),
    tx({ account: "card", amount: 1000, category: "groceries" }),
  ];
  assert.equal(balance(a, ts), -91000);
  assert.equal(totals(ts, "2026-02").spent, 1000);
});
test("invalid calendar dates and malformed persistent documents are rejected", () => {
  const d: Data = {
    accounts,
    transactions: [],
    categories: [{ id: "groceries", name: "Groceries", limit: 20000 }],
    bills: [],
    budgets: {},
  };
  assert.throws(() =>
    validate({ ...d, transactions: [tx({ date: "2026-02-30" })] }),
  );
  assert.throws(() =>
    validate({ ...d, transactions: [tx({ type: "expense", to: "card" })] }),
  );
  assert.throws(() =>
    validate({ ...d, budgets: { "2026-02": { groceries: -100 } } }),
  );
  assert.throws(() => validate({ ...d, accounts: [accounts[0], accounts[0]] }));
});
