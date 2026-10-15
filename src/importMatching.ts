import { type Data, type Transaction } from "./ledger";
import { billPaymentTotal, billStatus, loanParts } from "./planning";
export type ImportMatch = {
  id: string;
  kind: "transaction" | "bill" | "loan";
  label: string;
  reason: string;
  exact: boolean;
};
const dayDifference = (a: string, b: string) =>
  Math.abs(Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) /
  86400000;
const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((s) => s.length > 2);
const similar = (a: string, b: string) =>
  words(a).some((w) => words(b).includes(w));
export const rowImportKey = (
  account: string,
  date: string,
  amount: number,
  payee: string,
  incoming: boolean,
  ordinal: number,
) =>
  JSON.stringify([
    "csv-v2",
    account,
    date,
    amount,
    payee.trim().toLowerCase().replace(/\s+/g, " "),
    incoming,
    ordinal,
  ]);
export function findImportMatches(
  data: Data,
  account: string,
  row: {
    date: string;
    amount: number;
    payee: string;
    incoming: boolean;
    importKey?: string;
  },
): ImportMatch[] {
  const matches: ImportMatch[] = [];
  const tolerance = Math.max(100, Math.round(row.amount * 0.05));
  const relevant = (t: Transaction) =>
    (t.account === account &&
      (t.type === "income" || t.type === "refund") === row.incoming) ||
    (t.type === "transfer" && t.to === account && row.incoming);
  for (const t of data.transactions) {
    const exactKey = !!row.importKey && !!t.importKeys?.includes(row.importKey);
    if (!relevant(t) && !exactKey) continue;
    const days = dayDifference(row.date, t.date),
      difference = Math.abs(row.amount - t.amount);
    if (!exactKey && (days > 5 || difference > tolerance)) continue;
    matches.push({
      id: t.id,
      kind: "transaction",
      label: `${t.date} · ${t.payee} · $${(t.amount / 100).toFixed(2)}`,
      reason: exactKey
        ? "This CSV row was already imported."
        : `${days} day(s) apart; amount difference $${(difference / 100).toFixed(2)}${similar(row.payee, t.payee) ? "; description overlaps" : ""}. Review before linking.`,
      exact: exactKey,
    });
  }
  for (const p of data.loanPayments || []) {
    const parts = loanParts(data, p);
    const amount =
      row.incoming && p.loan === account
        ? Math.abs(row.amount - parts.principal) <=
          Math.abs(row.amount - parts.total)
          ? parts.principal
          : parts.total
        : parts.account === account && !row.incoming
          ? parts.total
          : -1;
    const days = dayDifference(row.date, parts.date);
    if (amount < 0 || days > 5 || Math.abs(amount - row.amount) > tolerance)
      continue;
    matches.push({
      id: p.id,
      kind: "loan",
      label: `Loan payment ${parts.date} · $${(amount / 100).toFixed(2)}`,
      reason:
        "Existing principal/interest payment; linking preserves both parts and creates no new cash movement.",
      exact: false,
    });
  }
  if (!row.incoming)
    for (const b of data.bills) {
      if (b.account !== account) continue;
      const days = dayDifference(row.date, b.date),
        expected = Math.max(0, b.amount - billPaymentTotal(data, b));
      if (
        days > 7 ||
        (Math.abs(row.amount - expected) > tolerance &&
          Math.abs(row.amount - b.amount) > tolerance &&
          !similar(row.payee, b.name))
      )
        continue;
      matches.push({
        id: b.id,
        kind: "bill",
        label: `${b.name} · due ${b.date} · ${billStatus(data, b)}`,
        reason:
          "Possible bill occurrence. Link an existing payment, or create one actual payment for this occurrence.",
        exact: false,
      });
    }
  return matches;
}
