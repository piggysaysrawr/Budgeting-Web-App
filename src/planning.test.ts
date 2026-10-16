import { replaceTransaction, remainingPrincipal } from "./planning";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type Data,
  type Transaction,
  empty,
  uid,
  balance,
  totals,
  validate,
} from "./ledger";
import {
  billStatus,
  billPaymentTotal,
  billLinks,
  recordBillPayment,
  linkBillPayment,
  unlinkBill,
  removeTransactions,
  restoreTransactions,
  editBill,
  deleteBill,
  nextOccurrence,
  saveLoanPayment,
  loanParts,
  categorySpending,
  categoryLimit,
  totalBudget,
  deleteCategory,
  cashFlow,
  actualInterest,
} from "./planning";
import {
  parseCSV,
  guessMapping,
  previewRows,
  applyReviewedImport,
} from "./importer";
function setup(): Data {
  const d = empty();
  d.accounts = [
    {
      id: "cash",
      name: "Checking",
      type: "checking",
      opening: 1000000,
      date: "2026-01-01",
    },
    {
      id: "save",
      name: "Savings",
      type: "savings",
      opening: 500000,
      date: "2026-01-01",
    },
    {
      id: "loan",
      name: "Car loan",
      type: "debt",
      opening: -500000,
      date: "2026-01-01",
      originalPrincipal: 1000000,
      expectedPayment: 30000,
      rateBps: 625,
    },
    {
      id: "card",
      name: "Card",
      type: "credit",
      opening: -10000,
      date: "2026-01-01",
    },
  ];
  d.bills = [
    {
      id: "internet",
      name: "Internet",
      amount: 8000,
      date: "2026-01-31",
      anchor: 31,
      account: "cash",
      category: d.categories[1].id,
      frequency: "monthly",
    },
  ];
  return d;
}
const tx = (d: Data, patch: Partial<Transaction> = {}): Transaction => ({
  id: uid(),
  date: "2026-01-31",
  amount: 8000,
  type: "expense",
  account: "cash",
  category: d.categories[1].id,
  payee: "Internet",
  notes: "",
  ...patch,
});
const loanInput = (d: Data) => ({
  loan: "loan",
  account: "cash",
  date: "2026-01-31",
  principal: 25000,
  interest: 5000,
  category: d.categories[1].id,
});
const preview = (d: Data, text: string, account = "cash") => {
  const f = parseCSV(text);
  return previewRows(f, guessMapping(f.headers, "sofi"), account, d);
};

test("monthly deficit stays negative after savings transfer; transfer net worth is invariant", () => {
  const d = setup();
  d.transactions = [
    tx(d, { type: "income", amount: 200000, category: "" }),
    tx(d, {
      type: "transfer",
      account: "save",
      to: "cash",
      amount: 50000,
      category: "",
    }),
    tx(d, { amount: 230000 }),
  ];
  const t = totals(d.transactions, "2026-01");
  assert.equal(t.income - t.spent, -30000);
  const noTransfer = d.transactions.filter((t) => t.type !== "transfer");
  assert.equal(
    d.accounts.reduce((n, a) => n + balance(a, d.transactions), 0),
    d.accounts.reduce((n, a) => n + balance(a, noTransfer), 0),
  );
  assert.equal(cashFlow(d, "2026-01", "cash"), 20000);
});
test("partial, full, extra and explicitly settled payments preserve expected amounts", () => {
  let d = setup();
  d = recordBillPayment(d, "internet", 3000, "2026-01-30");
  assert.equal(billStatus(d, d.bills[0]), "Partially paid");
  d = recordBillPayment(d, "internet", 5000, "2026-01-31");
  assert.equal(billStatus(d, d.bills[0]), "Paid");
  assert.equal(d.bills.length, 2);
  assert.equal(d.bills[1].date, "2026-02-28");
  assert.equal(d.bills[0].amount, 8000);
  const extra = recordBillPayment(setup(), "internet", 10000, "2026-01-31");
  assert.equal(billPaymentTotal(extra, extra.bills[0]), 10000);
  const settled = recordBillPayment(
    setup(),
    "internet",
    6000,
    "2026-01-31",
    true,
  );
  assert.equal(billStatus(settled, settled.bills[0]), "Paid");
});
test("deleting payments recalculates partial/unpaid and restoration restores bill associations", () => {
  let d = recordBillPayment(setup(), "internet", 3000, "2026-01-30");
  d = recordBillPayment(d, "internet", 5000, "2026-01-31");
  let removed = removeTransactions(d, [d.transactions[0].id]);
  assert.equal(billStatus(removed, removed.bills[0]), "Partially paid");
  removed = removeTransactions(removed, [removed.transactions[0].id]);
  assert.equal(billStatus(removed, removed.bills[0]), "Unpaid");
  assert.equal(removed.bills.length, 2);
  let restored = restoreTransactions(
    removed,
    removed.deletedTransactions![0].id,
  );
  assert.equal(billStatus(restored, restored.bills[0]), "Partially paid");
  restored = restoreTransactions(restored, restored.deletedTransactions![0].id);
  assert.equal(billStatus(restored, restored.bills[0]), "Paid");
  assert.equal(restored.transactions.length, 2);
});
test("legacy under-expected paid bills preserve explicit settlement", () => {
  const d = setup(),
    t = tx(d, { amount: 6000 });
  d.transactions = [t, tx(d, { amount: 1000 })];
  d.bills[0].paidTransaction = t.id;
  assert.equal(billStatus(d, d.bills[0]), "Paid");
  const removed = removeTransactions(d, [d.transactions[1].id]);
  assert.equal(billStatus(removed, removed.bills[0]), "Paid");
  const paidRemoved = removeTransactions(d, [t.id]);
  assert.equal(billStatus(paidRemoved, paidRemoved.bills[0]), "Unpaid");
  const restored = restoreTransactions(
    paidRemoved,
    paidRemoved.deletedTransactions![0].id,
  );
  assert.equal(billStatus(restored, restored.bills[0]), "Paid");
});
test("editing and deleting bills preserves historical transactions", () => {
  let d = recordBillPayment(setup(), "internet", 8000, "2026-01-31");
  const before = JSON.stringify(d.transactions),
    next = d.bills[1];
  d = editBill(
    d,
    next.id,
    {
      name: "New Internet",
      amount: 9000,
      date: "2026-02-27",
      frequency: "quarterly",
    },
    "future",
  );
  assert.equal(JSON.stringify(d.transactions), before);
  assert.equal(d.bills[0].name, "Internet");
  d = deleteBill(d, "internet", "one");
  assert.equal(JSON.stringify(d.transactions), before);
  assert.equal(d.bills.length, 1);
});
test("all recurrence dates are calendar-correct", () => {
  const b = setup().bills[0];
  assert.equal(nextOccurrence({ ...b, frequency: "weekly" }), "2026-02-07");
  assert.equal(nextOccurrence({ ...b, frequency: "biweekly" }), "2026-02-14");
  assert.equal(nextOccurrence({ ...b, frequency: "quarterly" }), "2026-04-30");
  assert.equal(
    nextOccurrence({
      ...b,
      date: "2028-02-29",
      anchor: 29,
      frequency: "yearly",
    }),
    "2029-02-28",
  );
});
test("manual unpaid keeps transactions, re-link does not duplicate payment or future bill", () => {
  let d = recordBillPayment(setup(), "internet", 8000, "2026-01-31");
  const id = d.transactions[0].id;
  d = unlinkBill(d, "internet");
  assert.equal(billStatus(d, d.bills[0]), "Unpaid");
  assert.equal(d.transactions.length, 1);
  d = linkBillPayment(d, "internet", [id]);
  assert.equal(d.transactions.length, 1);
  assert.equal(d.bills.length, 2);
  assert.throws(
    () => linkBillPayment(d, d.bills[1].id, [id]),
    /already linked/,
  );
});
test("credit-card bill payments are transfers, not additional spending", () => {
  let d = setup();
  d.bills[0].loanAccount = "card";
  d = recordBillPayment(d, "internet", 8000, "2026-01-31");
  assert.equal(d.transactions[0].type, "transfer");
  assert.equal(totals(d.transactions, "2026-01").spent, 0);
  assert.equal(balance(d.accounts[3], d.transactions), -2000);
});
test("loan principal, interest, cash flow, edit, extra principal, delete and restore stay synchronized", () => {
  let d = setup();
  d = saveLoanPayment(d, loanInput(d));
  assert.equal(balance(d.accounts[0], d.transactions), 970000);
  assert.equal(balance(d.accounts[2], d.transactions), -475000);
  assert.equal(totals(d.transactions, "2026-01").spent, 5000);
  assert.equal(cashFlow(d, "2026-01", "cash"), -30000);
  assert.equal(loanParts(d, d.loanPayments![0]).total, 30000);
  d = saveLoanPayment(d, {
    ...loanInput(d),
    id: d.loanPayments![0].id,
    principal: 35000,
  });
  assert.equal(balance(d.accounts[2], d.transactions), -465000);
  const removed = removeTransactions(d, [d.transactions[1].id]);
  assert.equal(removed.transactions.length, 0);
  assert.equal(removed.loanPayments!.length, 0);
  assert.equal(balance(removed.accounts[2], removed.transactions), -500000);
  const restored = restoreTransactions(
    removed,
    removed.deletedTransactions![0].id,
  );
  assert.equal(balance(restored.accounts[2], restored.transactions), -465000);
  assert.throws(
    () => saveLoanPayment(d, { ...loanInput(d), principal: 500001 }),
    /exceeds/,
  );
});
test("existing full loan expense is split once with receipt and bill links preserved", () => {
  let d = setup();
  const t = tx(d, { amount: 30000, importKeys: ["test-key"] });
  d.transactions = [t];
  d.bills[0].amount = 30000;
  d = linkBillPayment(d, "internet", [t.id]);
  d = saveLoanPayment(d, { ...loanInput(d), existingId: t.id });
  assert.equal(d.transactions.length, 2);
  assert.equal(totals(d.transactions, "2026-01").spent, 5000);
  assert.equal(billPaymentTotal(d, d.bills[0]), 30000);
  assert.equal(billLinks(d.bills[0]).length, 2);
  d = saveLoanPayment(d, {
    ...loanInput(d),
    id: d.loanPayments![0].id,
    principal: 0,
    interest: 30000,
  });
  assert.ok(d.transactions[0].importKeys?.includes("test-key"));
});
test("rates and actual interest tags do not create estimated transactions", () => {
  const d = setup();
  d.accounts[1].rateBps = 425;
  d.accounts[3].rateBps = 2499;
  d.transactions = [
    tx(d, { account: "card", amount: 1500, interest: "charged" }),
    tx(d, {
      account: "save",
      type: "income",
      category: "",
      amount: 250,
      interest: "earned",
    }),
  ];
  validate(d);
  assert.equal(actualInterest(d, "2026-01", "charged"), 1500);
  assert.equal(actualInterest(d, "2026-01", "earned"), 250);
  assert.equal(d.transactions.length, 2);
  d.accounts[0].rateBps = -1;
  assert.throws(() => validate(d), /Annual rate/);
});
test("parent spending rolls up once; parent and child budgets are not doubled", () => {
  const d = setup(),
    parent = d.categories[0],
    child = d.categories[2];
  d.bills = []; // Isolate manual envelope behavior from scheduled minimums.
  child.parentId = parent.id;
  parent.limit = 30000;
  child.limit = 10000;
  d.transactions = [
    tx(d, { category: parent.id, amount: 1000 }),
    tx(d, { category: child.id, amount: 5000 }),
    tx(d, { category: child.id, type: "refund", amount: 500 }),
  ];
  assert.equal(categorySpending(d, "2026-01", parent.id), 5500);
  assert.equal(categorySpending(d, "2026-01", child.id), 4500);
  assert.equal(totalBudget(d, "2026-01"), 30000);
  parent.limit = 0;
  assert.equal(categoryLimit(d, "2026-01", parent.id), 10000);
  d.budgets["2026-01"] = { [parent.id]: 0 };
  assert.equal(totalBudget(d, "2026-01"), 0);
});
test("category deletion reassigns active and recoverable records without deleting financial history", () => {
  let d = setup();
  const id = d.categories[1].id,
    target = d.categories[2].id;
  d.transactions = [tx(d)];
  assert.throws(() => deleteCategory(d, id), /Choose a category/);
  d = removeTransactions(d, [d.transactions[0].id]);
  d = deleteCategory(d, id, target);
  assert.equal(d.bills[0].category, target);
  d = restoreTransactions(d, d.deletedTransactions![0].id);
  assert.equal(d.transactions[0].category, target);
  validate(d);
});
test("subcategory moves preserve IDs and enforce one level", () => {
  const d = setup(),
    before = d.categories.map((c) => c.id);
  d.categories[2].parentId = d.categories[0].id;
  validate(d);
  d.categories[3].parentId = d.categories[2].id;
  assert.throws(() => validate(d), /one level/);
  assert.deepEqual(
    d.categories.map((c) => c.id),
    before,
  );
});
test("uncertain CSV manual match is reviewed; link preserves actual amount/date and prevents reimport", () => {
  let d = setup();
  const t = tx(d, { amount: 7900, date: "2026-01-29" });
  d.transactions = [t];
  const rows = preview(d, "Date,Description,Amount\n2026-01-31,Internet,-80");
  assert.equal(rows[0].include, false);
  assert.ok(rows[0].matches?.some((m) => m.id === t.id));
  rows[0] = {
    ...rows[0],
    include: true,
    action: "existing",
    matchId: t.id,
    billId: "internet",
  };
  d = applyReviewedImport(rows, "cash", d);
  assert.equal(d.transactions.length, 1);
  assert.equal(d.transactions[0].amount, 7900);
  assert.equal(d.transactions[0].date, "2026-01-29");
  assert.equal(billStatus(d, d.bills[0]), "Partially paid");
  const repeat = preview(d, "Date,Description,Amount\n2026-01-31,Internet,-80");
  assert.equal(repeat[0].exactDuplicate, true);
  repeat[0].include = true;
  assert.throws(
    () => applyReviewedImport(repeat, "cash", d),
    /already imported/,
  );
});
test("CSV unpaid bill match creates one linked payment and delete/restore recomputes status", () => {
  let d = setup();
  const rows = preview(d, "Date,Description,Amount\n2026-01-31,Internet,-80");
  rows[0] = { ...rows[0], include: true, action: "bill", billId: "internet" };
  d = applyReviewedImport(rows, "cash", d);
  assert.equal(d.transactions.length, 1);
  assert.equal(billStatus(d, d.bills[0]), "Paid");
  assert.throws(() => applyReviewedImport(rows, "cash", d), /already imported/);
  const removed = removeTransactions(d, [d.transactions[0].id]);
  assert.equal(billStatus(removed, removed.bills[0]), "Unpaid");
  const restored = restoreTransactions(
    removed,
    removed.deletedTransactions![0].id,
  );
  assert.equal(billStatus(restored, restored.bills[0]), "Paid");
});
test("CSV recognizes full split loan payments and transfers across posting dates", () => {
  let d = setup();
  d = saveLoanPayment(d, loanInput(d));
  const rows = preview(
    d,
    "Date,Description,Amount\n2026-02-02,Car payment,-300",
  );
  const p = d.loanPayments![0];
  assert.ok(rows[0].matches?.some((m) => m.id === p.id && m.kind === "loan"));
  rows[0] = { ...rows[0], include: true, action: "loan", matchId: p.id };
  d = applyReviewedImport(rows, "cash", d);
  assert.equal(d.transactions.length, 2);
  const transfers = preview(
    d,
    "Date,Description,Amount\n2026-02-02,Payment received,250",
    "loan",
  );
  assert.ok(
    transfers[0].matches?.some((m) => m.id === p.id && m.kind === "loan"),
  );
});
test("new imported loan payment requires an exact full split and no duplicate expense", () => {
  let d = setup();
  const rows = preview(
    d,
    "Date,Description,Amount\n2026-01-31,Car payment,-300",
  );
  rows[0] = {
    ...rows[0],
    include: true,
    loanId: "loan",
    principal: "250.00",
    interest: "49.00",
  };
  assert.throws(() => applyReviewedImport(rows, "cash", d), /must equal/);
  rows[0].interest = "50.00";
  d = applyReviewedImport(rows, "cash", d);
  assert.equal(d.transactions.length, 2);
  assert.equal(totals(d.transactions, "2026-01").spent, 5000);
  assert.throws(() => applyReviewedImport(rows, "cash", d), /already imported/);
});
test("recovery refuses a CSV row that has since been reimported", () => {
  let d = setup();
  const rows = preview(d, "Date,Description,Amount\n2026-01-10,Shop,-10");
  d = applyReviewedImport(rows, "cash", d);
  d = removeTransactions(d, [d.transactions[0].id]);
  d = applyReviewedImport(
    preview(d, "Date,Description,Amount\n2026-01-10,Shop,-10"),
    "cash",
    d,
  );
  assert.throws(
    () => restoreTransactions(d, d.deletedTransactions![0].id),
    /already present/,
  );
});

test("accrued loan interest is not principal and paying a recorded charge never expenses it twice", () => {
  let d = setup();
  const charge = tx(d, {
    account: "loan",
    amount: 5000,
    interest: "charged",
    payee: "Loan interest charge",
  });
  d.transactions = [charge];
  d = saveLoanPayment(d, { ...loanInput(d), interestChargeId: charge.id });
  assert.equal(totals(d.transactions, "2026-01").spent, 5000);
  assert.equal(balance(d.accounts[2], d.transactions), -475000);
  assert.equal(loanParts(d, d.loanPayments![0]).principal, 25000);
  assert.equal(loanParts(d, d.loanPayments![0]).interest, 5000);
  const removed = removeTransactions(d, [d.loanPayments![0].transactionIds[0]]);
  assert.equal(removed.transactions.length, 1);
  assert.equal(balance(removed.accounts[2], removed.transactions), -505000);
  const restored = restoreTransactions(
    removed,
    removed.deletedTransactions![0].id,
  );
  assert.equal(balance(restored.accounts[2], restored.transactions), -475000);
  const deleteCharge = removeTransactions(restored, [charge.id]);
  assert.equal(deleteCharge.transactions.length, 0);
  assert.equal(deleteCharge.loanPayments!.length, 0);
});

test("editing a partial payment to the expected amount updates status and creates one next occurrence", () => {
  let d = recordBillPayment(setup(), "internet", 3000, "2026-01-31");
  d = replaceTransaction(d, { ...d.transactions[0], amount: 8000 });
  assert.equal(billStatus(d, d.bills[0]), "Paid");
  assert.equal(d.bills.length, 2);
});
test("accrued interest does not change remaining principal", () => {
  const d = setup();
  d.transactions = [
    tx(d, { account: "loan", amount: 5000, interest: "charged" }),
  ];
  assert.equal(remainingPrincipal(d, "loan"), 500000);
  assert.equal(balance(d.accounts[2], d.transactions), -505000);
});

test("restoring payment after future due-date edits does not generate duplicate future bills", () => {
  let d = recordBillPayment(setup(), "internet", 8000, "2026-01-31");
  d = editBill(d, d.bills[1].id, { date: "2026-02-27" }, "one");
  d = removeTransactions(d, [d.transactions[0].id]);
  d = restoreTransactions(d, d.deletedTransactions![0].id);
  assert.equal(d.bills.length, 2);
  assert.equal(d.bills[1].date, "2026-02-27");
});

test("editing, deleting and restoring transfers updates both accounts and preserves monthly totals", () => {
  let d = setup();
  const t = tx(d, {
    type: "transfer",
    account: "cash",
    to: "save",
    amount: 50000,
    category: "",
  });
  d.transactions = [t];
  d = replaceTransaction(d, { ...t, amount: 70000 });
  assert.equal(balance(d.accounts[0], d.transactions), 930000);
  assert.equal(balance(d.accounts[1], d.transactions), 570000);
  const before = totals(d.transactions, "2026-01");
  d = removeTransactions(d, [t.id]);
  assert.equal(balance(d.accounts[0], d.transactions), 1000000);
  assert.equal(balance(d.accounts[1], d.transactions), 500000);
  d = restoreTransactions(d, d.deletedTransactions![0].id);
  assert.equal(balance(d.accounts[1], d.transactions), 570000);
  assert.deepEqual(totals(d.transactions, "2026-01"), before);
});
test("loan-linked bill totals include principal and interest; deleting one part reopens the bill", () => {
  let d = setup();
  d.bills[0] = { ...d.bills[0], amount: 30000, loanAccount: "loan" };
  d = saveLoanPayment(d, { ...loanInput(d), billId: "internet" });
  assert.equal(billStatus(d, d.bills[0]), "Paid");
  assert.equal(billPaymentTotal(d, d.bills[0]), 30000);
  d = removeTransactions(d, [d.transactions[0].id]);
  assert.equal(billStatus(d, d.bills[0]), "Unpaid");
  assert.equal(balance(d.accounts[2], d.transactions), -500000);
  d = restoreTransactions(d, d.deletedTransactions![0].id);
  assert.equal(billStatus(d, d.bills[0]), "Paid");
  assert.equal(billLinks(d.bills[0]).length, 2);
});
