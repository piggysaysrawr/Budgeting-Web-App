import { type Data, validate } from "./ledger";
import { billLinks } from "./planning";
/** One atomic household update, including every part of linked loan payments. */
export function planAccountDeletion(data: Data, accountId: string) {
  const account = data.accounts.find((a) => a.id === accountId);
  if (!account) throw Error("This account no longer exists.");
  const groups = (data.loanPayments || []).filter(
    (p) =>
      p.loan === accountId ||
      p.transactionIds.some((id) =>
        data.transactions.some(
          (t) => t.id === id && (t.account === accountId || t.to === accountId),
        ),
      ),
  );
  const groupIds = new Set(groups.flatMap((p) => p.transactionIds));
  const transactions = data.transactions.filter(
    (t) => t.account === accountId || t.to === accountId || groupIds.has(t.id),
  );
  const removedIds = new Set(transactions.map((t) => t.id));
  const bills = data.bills.filter(
    (b) => b.account === accountId || b.loanAccount === accountId,
  );
  const removedBillIds = new Set(bills.map((b) => b.id));
  const reopenedBills = data.bills.filter(
    (b) =>
      !removedBillIds.has(b.id) &&
      billLinks(b).some((id) => removedIds.has(id)),
  );
  const affectedIds = new Set(
    transactions.flatMap((t) => [t.account, ...(t.to ? [t.to] : [])]),
  );
  const affectedAccounts = data.accounts.filter(
    (a) => a.id !== accountId && affectedIds.has(a.id),
  );
  const next: Data = {
    ...data,
    accounts: data.accounts.filter((a) => a.id !== accountId),
    debtPreferences: data.debtPreferences
      ? {
          ...data.debtPreferences,
          creditAccountIds: data.debtPreferences.creditAccountIds.filter(
            (id) => id !== accountId,
          ),
        }
      : undefined,
    transactions: data.transactions.filter((t) => !removedIds.has(t.id)),
    loanPayments: data.loanPayments?.filter(
      (p) => !groups.some((g) => g.id === p.id),
    ),
    bills: data.bills
      .filter((b) => !removedBillIds.has(b.id))
      .map((b) => {
        if (!billLinks(b).some((id) => removedIds.has(id))) return b;
        return {
          ...b,
          paidTransaction: undefined,
          paymentIds: billLinks(b).filter((id) => !removedIds.has(id)),
          settledPaymentIds: undefined,
        };
      }),
  };
  validate(next);
  return {
    account,
    transactions,
    bills,
    reopenedBills,
    affectedAccounts,
    next,
  };
}
