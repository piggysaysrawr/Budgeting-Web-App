import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCSV,
  guessMapping,
  previewRows,
  importTransactions,
  importDate,
  importAmount,
} from "./importer";
import { empty, balance, totals, type Data } from "./ledger";
function setup(): Data {
  const d = empty();
  d.accounts = [
    {
      id: "checking",
      name: "SoFi Checking",
      type: "checking",
      opening: 100000,
      date: "2026-01-01",
    },
    {
      id: "savings",
      name: "SoFi Savings",
      type: "savings",
      opening: 0,
      date: "2026-01-01",
    },
    {
      id: "card",
      name: "Discover",
      type: "credit",
      opening: 0,
      date: "2026-01-01",
    },
  ];
  return d;
}
const relayHeader =
  "Authorized Date,Posted Date,Status,Account Name,Description,Primary Category,Detailed Category,Amount";
test("SoFi Relay headers, signed amounts, categories and quoted commas", () => {
  const d = setup(),
    file = parseCSV(
      relayHeader +
        '\r\n2026-02-01,2026-02-02,Posted,Checking,"Fictional market, town",Food,Groceries,-50.00\r\n2026-02-01,2026-02-02,Posted,Checking,Fictional employer,Income,Paycheck,200.00',
    );
  const rows = previewRows(
    file,
    guessMapping(file.headers, "sofi"),
    "checking",
    d,
  );
  assert.equal(rows[0].date, "2026-02-02");
  assert.equal(rows[0].payee, "Fictional market, town");
  assert.equal(rows[0].type, "expense");
  assert.equal(
    rows[0].category,
    d.categories.find((c) => c.name === "Groceries")!.id,
  );
  const tx = importTransactions(rows, "checking", d);
  assert.equal(balance(d.accounts[0], tx), 115000);
  assert.deepEqual(totals(tx, "2026-02"), { income: 20000, spent: 5000 });
});
test("Discover and Amex positive charges and negative refunds", () => {
  for (const profile of ["discover", "amex"] as const) {
    const d = setup(),
      f = parseCSV(
        "Date,Description,Amount\n02/01/2026,Fictional shop,50.00\n02/02/2026,Fictional return,-10.00",
      );
    const rows = previewRows(f, guessMapping(f.headers, profile), "card", d);
    assert.deepEqual(
      rows.map((r) => r.type),
      ["expense", "refund"],
    );
    const ts = importTransactions(rows, "card", d);
    assert.equal(balance(d.accounts[2], ts), -4000);
    assert.equal(totals(ts, "2026-02").spent, 4000);
  }
});
test("CSV parser handles BOM, quoted newlines, preamble and semicolons", () => {
  const f = parseCSV(
    '\uFEFFExport\nDate;Description;Amount\n2026-02-01;"Fictional\nmerchant";-1.00',
  );
  assert.equal(f.rows.length, 1);
  assert.equal(f.rows[0][1], "Fictional\nmerchant");
});
test("strict dates, exact cents, currency and invalid amounts", () => {
  assert.equal(importDate("02/28/2026", "mdy"), "2026-02-28");
  assert.equal(importDate("28/02/2026", "dmy"), "2026-02-28");
  assert.throws(() => importDate("02/30/2026", "mdy"));
  assert.throws(() => importDate("01/02/26", "mdy"));
  assert.equal(importAmount("$1,234.56"), 123456);
  assert.equal(importAmount("(25.10)"), -2510);
  assert.equal(importAmount("+0.29"), 29);
  for (const n of ["1,2.00", "1e4", "1.001", "", "(-1.00)"])
    assert.throws(() => importAmount(n));
});
test("separate debit/credit and explicit debit type columns", () => {
  const d = setup(),
    f = parseCSV(
      "Date,Description,Debit,Credit\n2026-02-01,Market,50,\n2026-02-02,Salary,,200",
    );
  let rows = previewRows(f, guessMapping(f.headers, "sofi"), "checking", d);
  assert.deepEqual(
    rows.map((r) => r.type),
    ["expense", "income"],
  );
  const f2 = parseCSV(
    "Date,Description,Amount,Type\n2026-02-01,Market,50,DEBIT",
  );
  rows = previewRows(f2, guessMapping(f2.headers, "sofi"), "checking", d);
  assert.equal(rows[0].type, "expense");
});
test("overlapping and repeated rows are skipped by default", () => {
  const d = setup(),
    f = parseCSV(
      "Date,Description,Amount\n2026-02-01,Market,-50\n2026-02-01,Market,-50",
    );
  let rows = previewRows(f, guessMapping(f.headers, "sofi"), "checking", d);
  assert.equal(rows.filter((r) => r.include).length, 1);
  d.transactions = importTransactions(rows, "checking", d);
  rows = previewRows(f, guessMapping(f.headers, "sofi"), "checking", d);
  assert.equal(rows.filter((r) => r.include).length, 0);
  assert.throws(
    () => importTransactions(rows, "checking", d),
    /Select at least/,
  );
});
test("bank categories flag transfers even without transfer words in descriptions", () => {
  const d = setup(),
    f = parseCSV(
      relayHeader +
        "\n2026-02-01,2026-02-01,Posted,Checking,Fictional institution,Transfers,Credit card payments,-50",
    );
  const rows = previewRows(f, guessMapping(f.headers, "sofi"), "checking", d);
  assert.equal(rows[0].type, "transfer");
  assert.equal(rows[0].include, false);
  rows[0].include = true;
  assert.throws(
    () => importTransactions(rows, "checking", d),
    /different account/,
  );
  rows[0].other = "card";
  const ts = importTransactions(rows, "checking", d);
  assert.equal(totals(ts, "2026-02").spent, 0);
  assert.equal(balance(d.accounts[0], ts), 95000);
  assert.equal(balance(d.accounts[2], ts), 5000);
});
test("incoming transfer reverses legs and cannot be booked twice from another file", () => {
  const d = setup(),
    f = parseCSV("Date,Description,Amount\n2026-02-01,Transfer received,50");
  const rows = previewRows(f, guessMapping(f.headers, "sofi"), "card", d);
  rows[0].include = true;
  rows[0].other = "checking";
  const ts = importTransactions(rows, "card", d);
  assert.equal(ts[0].account, "checking");
  assert.equal(ts[0].to, "card");
  d.transactions = ts;
  assert.throws(
    () => importTransactions(rows, "card", d),
    /already (saved|imported)/,
  );
});
test("pending, invalid and before-opening rows cannot be selected for saving", () => {
  const d = setup(),
    f = parseCSV(
      relayHeader +
        "\n2026-02-01,2026-02-01,Pending,Checking,Market,Food,Groceries,-50\n2025-01-01,2025-01-01,Posted,Checking,Market,Food,Groceries,-50\n2026-02-01,2026-02-01,Posted,Checking,Market,Food,Groceries,abc",
    );
  const rows = previewRows(f, guessMapping(f.headers, "sofi"), "checking", d);
  assert.equal(rows.filter((r) => r.error).length, 3);
  rows[0].include = true;
  assert.throws(() => importTransactions(rows, "checking", d), /posted/);
});
test("malformed CSV, mismatched rows, and excessive rows fail before preview", () => {
  assert.throws(
    () => parseCSV("Date,Description,Amount\n2026-02-01,Market,50,extra"),
    /number of columns/,
  );
  assert.throws(() => parseCSV("not a financial export"), /No transaction/);
  assert.throws(
    () =>
      parseCSV(
        "Date,Description,Amount\n" +
          Array(2001).fill("2026-02-01,Market,50").join("\n"),
      ),
    /2,000/,
  );
});
test("a type change cannot silently reverse money direction", () => {
  const d = setup(),
    f = parseCSV("Date,Description,Amount\n2026-02-01,Market,-50");
  const rows = previewRows(f, guessMapping(f.headers, "sofi"), "checking", d);
  rows[0].type = "income";
  assert.throws(() => importTransactions(rows, "checking", d), /conflicts/);
});
