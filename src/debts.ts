import { type Data, type Account, balance } from "./ledger";
import { billStatus, remainingPrincipal } from "./planning";
export function trackedDebts(data: Data): Account[] {
  const cards = new Set(data.debtPreferences?.creditAccountIds || []);
  return data.accounts.filter(
    (a) => a.type === "debt" || (a.type === "credit" && cards.has(a.id)),
  );
}
export function debtBalance(data: Data, account: Account) {
  return Math.max(0, -balance(account, data.transactions));
}
export function debtSummary(data: Data, account: Account) {
  const outstanding = data.bills
    .filter(
      (b) => b.loanAccount === account.id && billStatus(data, b) !== "Paid",
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    owed: debtBalance(data, account),
    credit: Math.max(0, balance(account, data.transactions)),
    principal:
      account.type === "debt"
        ? remainingPrincipal(data, account.id)
        : undefined,
    next: outstanding[0],
  };
}
export function trackCreditCard(
  data: Data,
  id: string,
  include: boolean,
): Data {
  if (!data.accounts.some((a) => a.id === id && a.type === "credit"))
    throw Error("Choose an existing credit card account.");
  const ids = new Set(data.debtPreferences?.creditAccountIds || []);
  if (include) ids.add(id);
  else ids.delete(id);
  return {
    ...data,
    debtPreferences: { ...data.debtPreferences, creditAccountIds: [...ids] },
  };
}
