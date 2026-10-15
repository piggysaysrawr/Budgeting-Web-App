import { type Data, validate } from "./ledger";

/** One atomic household update: remove every reference to the deleted account. */
export function planAccountDeletion(data: Data, accountId: string) {
  const account = data.accounts.find((a) => a.id === accountId);
  if (!account) throw Error("This account no longer exists.");
  const transactions = data.transactions.filter(
    (t) => t.account === accountId || t.to === accountId,
  );
  const removedIds = new Set(transactions.map((t) => t.id));
  const bills = data.bills.filter((b) => b.account === accountId);
  const reopenedBills = data.bills.filter(
    (b) =>
      b.account !== accountId &&
      b.paidTransaction &&
      removedIds.has(b.paidTransaction),
  );
  const affectedIds = new Set(
    transactions.flatMap((t) =>
      t.type === "transfer" ? [t.account, t.to!] : [],
    ),
  );
  const affectedAccounts = data.accounts.filter(
    (a) => a.id !== accountId && affectedIds.has(a.id),
  );
  const next: Data = {
    ...data,
    accounts: data.accounts.filter((a) => a.id !== accountId),
    transactions: data.transactions.filter((t) => !removedIds.has(t.id)),
    bills: data.bills
      .filter((b) => b.account !== accountId)
      .map((b) =>
        b.paidTransaction && removedIds.has(b.paidTransaction)
          ? { ...b, paidTransaction: undefined }
          : b,
      ),
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
