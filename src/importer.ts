import {
  findImportMatches,
  rowImportKey,
  type ImportMatch,
} from "./importMatching";
import {
  linkBillPayment,
  saveLoanPayment,
  recordBillPayment,
} from "./planning";
import Papa from "papaparse";
import {
  cents,
  validDate,
  uid,
  validate,
  type Data,
  type Transaction,
} from "./ledger";

export type Profile = "sofi" | "discover" | "amex" | "custom";
export type Mapping = {
  date: number;
  payee: number;
  amount: number;
  debit: number;
  credit: number;
  direction: number;
  category: number;
  status: number;
  positive: "inflow" | "outflow";
  dateOrder: "mdy" | "dmy";
};
export type CSVFile = { headers: string[]; rows: string[][] };
export type ImportRow = {
  id: string;
  line: number;
  date: string;
  payee: string;
  amount: number;
  type: Transaction["type"];
  category: string;
  other: string;
  incoming: boolean;
  include: boolean;
  warning: string;
  error: string;
  importKey?: string;
  matches?: ImportMatch[];
  action?: "new" | "existing" | "loan" | "bill";
  matchId?: string;
  billId?: string;
  loanId?: string;
  principal?: string;
  interest?: string;
  exactDuplicate?: boolean;
};
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export function parseCSV(text: string): CSVFile {
  if (text.length > 2_000_000) throw Error("Choose a CSV smaller than 2 MB.");
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), {
    skipEmptyLines: "greedy",
  });
  if (result.errors.some((e) => e.code !== "UndetectableDelimiter"))
    throw Error("Could not read CSV: " + result.errors[0].message);
  const all = result.data;
  const headerIndex = all.findIndex(
    (row) =>
      row.some((c) =>
        /^(date|authorizeddate|transactiondate|transdate|postingdate|posteddate|postdate)$/.test(
          normalize(c),
        ),
      ) &&
      row.some((c) =>
        /^(amount|debit|credit|withdrawal|deposit|withdrawals|deposits|debitamount|creditamount)$/.test(
          normalize(c),
        ),
      ),
  );
  if (headerIndex < 0)
    throw Error(
      "No transaction header found. Export a CSV with date, description, and amount (or debit/credit) columns. PDF statements are not supported.",
    );
  const headers = all[headerIndex].map((s, i) => s.trim() || `Column ${i + 1}`),
    rows = all.slice(headerIndex + 1);
  if (!rows.length) throw Error("The CSV contains no transactions.");
  if (rows.length > 2000)
    throw Error(
      "Import at most 2,000 rows at a time. Choose a smaller date range.",
    );
  if (rows.some((row) => row.length !== headers.length))
    throw Error(
      "Some rows have a different number of columns. Check the CSV export before importing.",
    );
  return { headers, rows };
}
export function guessMapping(headers: string[], profile: Profile): Mapping {
  const find = (names: string[]) => {
    for (const n of names) {
      const i = headers.findIndex((h) => normalize(h) === n);
      if (i >= 0) return i;
    }
    return -1;
  };
  return {
    date: find([
      "postdate",
      "posteddate",
      "postingdate",
      "date",
      "transactiondate",
      "transdate",
    ]),
    payee: find([
      "description",
      "originaldescription",
      "merchant",
      "payee",
      "name",
      "transactiondescription",
    ]),
    amount: find(["amount", "transactionamount"]),
    debit: find([
      "debit",
      "debits",
      "withdrawal",
      "withdrawals",
      "debitamount",
    ]),
    credit: find(["credit", "credits", "deposit", "deposits", "creditamount"]),
    direction: find(["type", "transactiontype", "debitcredit"]),
    category: find(["detailedcategory", "category", "primarycategory"]),
    status: find(["status"]),
    positive:
      profile === "discover" || profile === "amex" ? "outflow" : "inflow",
    dateOrder: "mdy",
  };
}
export function importDate(value: string, order: "mdy" | "dmy") {
  const s = value.trim();
  if (validDate(s)) return s;
  const match = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/.exec(s);
  if (!match) throw Error("Use YYYY-MM-DD or a four-digit-year US date.");
  const [, a, b, y] = match;
  const date = `${y}-${(order === "mdy" ? a : b).padStart(2, "0")}-${(order === "mdy" ? b : a).padStart(2, "0")}`;
  if (!validDate(date)) throw Error("Invalid calendar date.");
  return date;
}
export function importAmount(value: string) {
  let s = value.trim();
  if (!s) throw Error("Missing amount.");
  const parentheses = /^\(.*\)$/.test(s);
  if (parentheses) s = s.slice(1, -1);
  s = s.replace(/^\$/, "").replace(/^\+/, "");
  if (s.includes(",") && !/^-?\d{1,3}(,\d{3})*(\.\d{1,2})?$/.test(s))
    throw Error("Invalid comma grouping in amount.");
  const n = cents(s.replaceAll(",", ""));
  if (parentheses && n < 0) throw Error("Ambiguous amount sign.");
  return parentheses ? -n : n;
}
export function previewRows(
  file: CSVFile,
  m: Mapping,
  account: string,
  data: Data,
): ImportRow[] {
  const a = data.accounts.find((a) => a.id === account);
  if (!a) throw Error("Choose an account.");
  if (
    m.date < 0 ||
    m.payee < 0 ||
    (m.amount < 0 && (m.debit < 0 || m.credit < 0))
  )
    throw Error(
      "Map date, description, and an amount column or both debit/credit columns.",
    );
  const seen = new Set<string>();
  const occurrences = new Map<string, number>();
  return file.rows.map((cells, index) => {
    const row: ImportRow = {
      id: uid(),
      line: index + 1,
      date: "",
      payee: "",
      amount: 0,
      type: "expense",
      category:
        data.categories.find(
          (c) => !c.archived && c.name.toLowerCase() === "miscellaneous",
        )?.id ||
        data.categories.find((c) => !c.archived)?.id ||
        "",
      other: "",
      incoming: false,
      include: true,
      warning: "",
      error: "",
    };
    try {
      if (
        m.status >= 0 &&
        !["posted", "cleared", "completed", "complete", "settled"].includes(
          cells[m.status].trim().toLowerCase(),
        )
      )
        throw Error("Only posted/settled transactions can be imported.");
      row.date = importDate(cells[m.date], m.dateOrder);
      row.payee = cells[m.payee].trim();
      if (!row.payee || row.payee.length > 120)
        throw Error("Description must be 1–120 characters.");
      let signed: number;
      if (m.amount >= 0) {
        signed = importAmount(cells[m.amount]);
        signed = m.positive === "inflow" ? signed : -signed;
        if (m.direction >= 0) {
          const direction = normalize(cells[m.direction]);
          if (["debit", "withdrawal", "purchase", "charge"].includes(direction))
            signed = -Math.abs(signed);
          else if (["credit", "deposit"].includes(direction))
            signed = Math.abs(signed);
        }
      } else {
        const debit = cells[m.debit].trim() ? importAmount(cells[m.debit]) : 0,
          credit = cells[m.credit].trim() ? importAmount(cells[m.credit]) : 0;
        if (debit < 0 || credit < 0 || (debit && credit))
          throw Error(
            "Separate debit/credit columns must be nonnegative with only one amount per row.",
          );
        signed = credit - debit;
      }
      row.amount = Math.abs(signed);
      if (row.amount === 0) throw Error("Zero amount: skip this row.");
      row.incoming = signed > 0;
      row.type =
        signed < 0
          ? "expense"
          : a.type === "credit" || a.type === "debt"
            ? "refund"
            : "income";
      if (row.date < a.date)
        throw Error(
          `Before opening balance date (${a.date}). Skip or correct your account opening balance/date first.`,
        );
      const bankCategory = m.category >= 0 ? cells[m.category] : "";
      const categoryAliases: Record<string, string> = {
        groceries: "Groceries",
        restaurants: "Dining out",
        dining: "Dining out",
        utilities: "Utilities",
        rent: "Housing",
        mortgage: "Housing",
        entertainment: "Entertainment",
        insurance: "Insurance",
        gas: "Transportation",
        transportation: "Transportation",
      };
      const suggestion = Object.entries(categoryAliases).find(([key]) =>
        bankCategory.toLowerCase().includes(key),
      );
      if (suggestion) {
        const category = data.categories.find(
          (c) =>
            !c.archived && c.name.toLowerCase() === suggestion[1].toLowerCase(),
        );
        if (category) row.category = category.id;
      }
      const transferColumns = file.headers
        .map((h, i) => (/category/i.test(h) ? cells[i] : ""))
        .join(" ");
      if (
        /\b(payment|transfer|autopay|autopmt|pmt|xfer|zelle)\b/i.test(
          row.payee,
        ) ||
        /transfers?|credit card payments?|debt payments?/i.test(transferColumns)
      ) {
        row.warning =
          "Possible payment/transfer. Excluded until reviewed; choose Transfer and the other account, or leave skipped.";
        row.include = false;
        row.type = "transfer";
      }
      const fingerprint = `${row.date}|${row.amount}|${row.payee.toLowerCase()}|${row.incoming}`;
      const duplicate = data.transactions.some(
        (t) =>
          t.date === row.date &&
          t.amount === row.amount &&
          ((t.account === account &&
            (t.type === "income" || t.type === "refund") === row.incoming) ||
            (t.type === "transfer" && t.to === account && row.incoming)),
      );
      if (duplicate || seen.has(fingerprint)) {
        row.warning +=
          (row.warning ? " " : "") +
          "Possible duplicate: same date, amount and direction already saved or repeated in this file. Skipped by default; include only if distinct.";
        row.include = false;
      }
      const ordinal = occurrences.get(fingerprint) || 0;
      occurrences.set(fingerprint, ordinal + 1);
      row.importKey = rowImportKey(
        account,
        row.date,
        row.amount,
        row.payee,
        row.incoming,
        ordinal,
      );
      row.matches = findImportMatches(data, account, row);
      row.exactDuplicate = row.matches.some((m) => m.exact);
      if (row.matches.length) {
        row.include = false;
        row.warning +=
          (row.warning ? " " : "") +
          (row.exactDuplicate
            ? "Already imported: this row cannot create another transaction."
            : "Potential existing transaction, bill, or loan payment. Review matches before including.");
      }
      seen.add(fingerprint);
    } catch (e) {
      row.error = e instanceof Error ? e.message : "Invalid row";
      row.include = false;
    }
    return row;
  });
}
export function importTransactions(
  rows: ImportRow[],
  account: string,
  data: Data,
): Transaction[] {
  const txs = rows
    .filter((r) => r.include)
    .map((r) => {
      if (r.error) throw Error(`Row ${r.line}: ${r.error}`);
      if (
        (r.type === "expense" && r.incoming) ||
        ((r.type === "income" || r.type === "refund") && !r.incoming)
      )
        throw Error(
          `Row ${r.line}: type conflicts with the money direction. Correct the amount mapping first.`,
        );
      if (r.type === "transfer" && (!r.other || r.other === account))
        throw Error(
          `Row ${r.line}: choose a different account for the transfer.`,
        );
      const source = r.type === "transfer" && r.incoming ? r.other : account;
      const to =
        r.type === "transfer" ? (r.incoming ? account : r.other) : undefined;
      const t: Transaction = {
        id: r.id,
        date: r.date,
        amount: r.amount,
        type: r.type,
        account: source,
        to,
        category: r.type === "expense" || r.type === "refund" ? r.category : "",
        payee: r.payee,
        notes: "Imported from CSV",
        importKeys: r.importKey ? [r.importKey] : undefined,
      };
      if (
        r.importKey &&
        data.transactions.some((t) => t.importKeys?.includes(r.importKey!))
      )
        throw Error(
          `Row ${r.line}: already imported. Match the existing record or skip this row.`,
        );
      // A transfer imported from its other account must not be booked twice.
      if (
        t.type === "transfer" &&
        data.transactions.some(
          (x) =>
            x.type === "transfer" &&
            x.account === t.account &&
            x.to === t.to &&
            x.amount === t.amount &&
            x.date === t.date,
        )
      )
        throw Error(
          `Row ${r.line}: this transfer is already saved. Skip this side of the payment.`,
        );
      return t;
    });
  if (!txs.length)
    throw Error("Select at least one valid transaction to import.");
  validate({ ...data, transactions: [...data.transactions, ...txs] });
  return txs;
}

export function applyReviewedImport(
  rows: ImportRow[],
  account: string,
  data: Data,
): Data {
  const selected = rows.filter((r) => r.include);
  if (!selected.length)
    throw Error("Select at least one valid row to process.");
  let next = data;
  for (const r of selected) {
    if (r.error) throw Error(`Row ${r.line}: ${r.error}`);
    if (
      r.action !== "existing" &&
      r.action !== "loan" &&
      r.importKey &&
      next.transactions.some((t) => t.importKeys?.includes(r.importKey!))
    )
      throw Error(
        `Row ${r.line}: already imported. Skip or link the existing payment.`,
      );
    if (r.action === "existing" || r.action === "loan") {
      const group =
        r.action === "loan"
          ? next.loanPayments?.find((p) => p.id === r.matchId)
          : undefined;
      const id = group?.transactionIds[0] || r.matchId;
      const t = next.transactions.find((t) => t.id === id);
      if (!t) throw Error(`Row ${r.line}: select an existing payment.`);
      if (
        r.importKey &&
        next.transactions.some(
          (x) =>
            x.importKeys?.includes(r.importKey!) &&
            x.id !== id &&
            !group?.transactionIds.includes(x.id),
        )
      )
        throw Error(
          "This CSV row is already linked to a different transaction.",
        );
      if (
        !r.matches?.some(
          (m) =>
            m.id === r.matchId &&
            (m.kind === "transaction" || m.kind === "loan"),
        )
      )
        throw Error("Select a suggested transaction match.");
      next = {
        ...next,
        transactions: next.transactions.map((x) =>
          x.id === id
            ? {
                ...x,
                importKeys: [
                  ...new Set([
                    ...(x.importKeys || []),
                    ...(r.importKey ? [r.importKey] : []),
                  ]),
                ],
              }
            : x,
        ),
      };
      if (r.billId)
        next = linkBillPayment(next, r.billId, group?.transactionIds || [t.id]);
    } else if (r.action === "bill") {
      const b = next.bills.find((b) => b.id === r.billId);
      if (!b || r.incoming || b.account !== account)
        throw Error(`Row ${r.line}: select the correct outgoing bill payment.`);
      if (
        b.loanAccount &&
        next.accounts.find((a) => a.id === b.loanAccount)?.type === "debt"
      ) {
        const principal = cents(r.principal || "0"),
          interest = cents(r.interest || "0");
        if (principal + interest !== r.amount)
          throw Error(
            `Row ${r.line}: principal plus interest must equal the CSV payment amount.`,
          );
        const before = new Set(next.transactions.map((t) => t.id));
        next = saveLoanPayment(next, {
          loan: b.loanAccount,
          account,
          date: r.date,
          principal,
          interest,
          category: b.category,
          billId: b.id,
        });
        const first = next.transactions.find((t) => !before.has(t.id));
        if (first && r.importKey)
          next = {
            ...next,
            transactions: next.transactions.map((t) =>
              t.id === first.id ? { ...t, importKeys: [r.importKey!] } : t,
            ),
          };
      } else if (b.loanAccount) {
        const before = new Set(next.transactions.map((t) => t.id));
        next = recordBillPayment(next, b.id, r.amount, r.date);
        const t = next.transactions.find((t) => !before.has(t.id));
        if (t && r.importKey)
          next = {
            ...next,
            transactions: next.transactions.map((x) =>
              x.id === t.id ? { ...x, importKeys: [r.importKey!] } : x,
            ),
          };
      } else {
        const t = importTransactions(
          [{ ...r, type: "expense", category: b.category, action: "new" }],
          account,
          next,
        )[0];
        next = linkBillPayment(
          { ...next, transactions: [...next.transactions, t] },
          b.id,
          [t.id],
        );
      }
    } else if (r.loanId) {
      if (r.incoming)
        throw Error(
          "Record loan splits from the cash-account side of the CSV.",
        );
      const principal = cents(r.principal || "0"),
        interest = cents(r.interest || "0");
      if (principal + interest !== r.amount)
        throw Error(
          `Row ${r.line}: principal plus interest must equal the CSV payment amount.`,
        );
      const before = new Set(next.transactions.map((t) => t.id));
      next = saveLoanPayment(next, {
        loan: r.loanId,
        account,
        date: r.date,
        principal,
        interest,
        category: r.category,
      });
      const first = next.transactions.find((t) => !before.has(t.id));
      if (first && r.importKey)
        next = {
          ...next,
          transactions: next.transactions.map((t) =>
            t.id === first.id ? { ...t, importKeys: [r.importKey!] } : t,
          ),
        };
    } else {
      const tx = importTransactions([r], account, next);
      next = { ...next, transactions: [...next.transactions, ...tx] };
    }
  }
  validate(next);
  return next;
}
