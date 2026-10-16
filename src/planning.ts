import {
  type Data,
  type Bill,
  type Transaction,
  type LoanPayment,
  balance,
  uid,
  validate,
  nextMonthly,
  validDate,
} from "./ledger";
export const billLinks = (b: Bill) => [
  ...new Set([
    ...(b.paymentIds || []),
    ...(b.paidTransaction ? [b.paidTransaction] : []),
  ]),
];
export function billPaymentTotal(data: Data, b: Bill) {
  return billLinks(b).reduce(
    (n, id) => n + (data.transactions.find((t) => t.id === id)?.amount || 0),
    0,
  );
}
export function billStatus(data: Data, b: Bill) {
  const total = billPaymentTotal(data, b);
  const settled =
    b.paidTransaction ||
    (b.settledPaymentIds?.length &&
      b.settledPaymentIds.every(
        (id) =>
          billLinks(b).includes(id) &&
          data.transactions.some((t) => t.id === id),
      ));
  return total > 0 && (total >= b.amount || settled)
    ? "Paid"
    : total > 0
      ? "Partially paid"
      : "Unpaid";
}
export function nextOccurrence(b: Bill) {
  if (b.frequency === "once") return null;
  if (b.frequency === "monthly") return nextMonthly(b.date, b.anchor);
  if (b.frequency === "weekly" || b.frequency === "biweekly") {
    const d = new Date(b.date + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + (b.frequency === "weekly" ? 7 : 14));
    return d.toISOString().slice(0, 10);
  }
  const months = b.frequency === "quarterly" ? 3 : 12;
  let date = b.date;
  for (let i = 0; i < months; i++) date = nextMonthly(date, b.anchor);
  return date;
}
export function ensureNextBill(data: Data, id: string): Data {
  const b = data.bills.find((b) => b.id === id);
  if (!b || billStatus(data, b) !== "Paid") return data;
  const date = nextOccurrence(b),
    seriesId = b.seriesId || b.id;
  if (
    !date ||
    data.bills.some(
      (x) =>
        x.id !== b.id && (x.seriesId || x.id) === seriesId && x.date >= b.date,
    )
  )
    return data;
  return {
    ...data,
    bills: [
      ...data.bills,
      {
        ...b,
        id: uid(),
        seriesId,
        date,
        paidTransaction: undefined,
        paymentIds: [],
        settledPaymentIds: undefined,
      },
    ],
  };
}
export function linkBillPayment(
  data: Data,
  billId: string,
  transactionIds: string[],
  settle = false,
): Data {
  const b = data.bills.find((b) => b.id === billId);
  if (!b) throw Error("Bill not found.");
  const expanded = [
    ...new Set(
      transactionIds.flatMap(
        (id) =>
          data.loanPayments?.find((p) => p.transactionIds.includes(id))
            ?.transactionIds || [id],
      ),
    ),
  ];
  for (const id of expanded) {
    const t = data.transactions.find((t) => t.id === id);
    if (
      !t ||
      t.account !== b.account ||
      !["expense", "transfer"].includes(t.type)
    )
      throw Error("Select an outgoing payment from the bill’s account.");
    if (data.bills.some((x) => x.id !== b.id && billLinks(x).includes(id)))
      throw Error("This payment is already linked to another bill.");
  }
  const ids = [...new Set([...billLinks(b), ...expanded])];
  let next = {
    ...data,
    bills: data.bills.map((x) =>
      x.id === b.id
        ? {
            ...x,
            paidTransaction: undefined,
            paymentIds: ids,
            settledPaymentIds: settle
              ? ids
              : x.settledPaymentIds ||
                (x.paidTransaction ? [x.paidTransaction] : undefined),
          }
        : x,
    ),
  };
  if (billStatus(data, b) !== "Paid") next = ensureNextBill(next, b.id);
  validate(next);
  return next;
}
export function unlinkBill(data: Data, id: string): Data {
  return {
    ...data,
    bills: data.bills.map((b) =>
      b.id === id
        ? {
            ...b,
            paidTransaction: undefined,
            paymentIds: [],
            settledPaymentIds: undefined,
          }
        : b,
    ),
  };
}
export function recordBillPayment(
  data: Data,
  id: string,
  amount: number,
  date: string,
  settle = false,
) {
  const b = data.bills.find((b) => b.id === id);
  if (!b) throw Error("Bill not found.");
  if (
    b.loanAccount &&
    data.accounts.find((a) => a.id === b.loanAccount)?.type === "debt"
  )
    throw Error("Use the principal/interest payment form for this bill.");
  const t: Transaction = {
    id: uid(),
    type: b.loanAccount ? "transfer" : "expense",
    to: b.loanAccount,
    account: b.account,
    date,
    amount,
    category: b.loanAccount ? "" : b.category,
    payee: b.name,
    notes: "Bill payment",
  };
  return linkBillPayment(
    { ...data, transactions: [...data.transactions, t] },
    id,
    [t.id],
    settle,
  );
}
export function editBill(
  data: Data,
  id: string,
  patch: Partial<Bill>,
  scope: "one" | "future",
): Data {
  const old = data.bills.find((b) => b.id === id);
  if (!old) throw Error("Bill not found.");
  const edited = {
    ...old,
    ...patch,
    id: old.id,
    anchor:
      patch.date && patch.date !== old.date
        ? Number(patch.date.slice(-2))
        : old.anchor,
  };
  const future = data.bills
    .filter(
      (b) =>
        b.id !== id &&
        (b.seriesId || b.id) === (old.seriesId || old.id) &&
        b.date >= old.date &&
        !billLinks(b).length,
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  let prev = edited;
  const replacements = new Map<string, Bill>();
  if (scope === "future")
    for (const b of future) {
      const date = nextOccurrence(prev);
      if (!date) continue;
      const next = {
        ...b,
        ...patch,
        date,
        anchor: edited.anchor,
        id: b.id,
        paidTransaction: b.paidTransaction,
        paymentIds: b.paymentIds,
        settledPaymentIds: b.settledPaymentIds,
      };
      replacements.set(b.id, next);
      prev = next;
    }
  const next = {
    ...data,
    bills: data.bills
      .filter(
        (b) =>
          !(
            scope === "future" &&
            edited.frequency === "once" &&
            future.some((x) => x.id === b.id)
          ),
      )
      .map((b) => (b.id === id ? edited : replacements.get(b.id) || b)),
  };
  validate(next);
  return reconcileBills(data, next);
}
export function deleteBill(
  data: Data,
  id: string,
  scope: "one" | "future",
): Data {
  const old = data.bills.find((b) => b.id === id);
  if (!old) throw Error("Bill not found.");
  return {
    ...data,
    bills: data.bills.filter(
      (b) =>
        b.id !== id &&
        !(
          scope === "future" &&
          (b.seriesId || b.id) === (old.seriesId || old.id) &&
          b.date >= old.date &&
          !billLinks(b).length
        ),
    ),
  };
}
export function removeTransactions(data: Data, ids: string[]): Data {
  const groups = (data.loanPayments || []).filter(
    (p) =>
      p.transactionIds.some((id) => ids.includes(id)) ||
      (!!p.interestChargeId && ids.includes(p.interestChargeId)),
  );
  const removed = new Set([...ids, ...groups.flatMap((p) => p.transactionIds)]);
  const tx = data.transactions.filter((t) => removed.has(t.id));
  if (!tx.length) throw Error("Transaction not found.");
  const links: Record<string, string[]> = {},
    settlements: Record<string, string[]> = {};
  for (const b of data.bills) {
    const affected = billLinks(b).filter((id) => removed.has(id));
    if (affected.length) {
      links[b.id] = affected;
      if (b.settledPaymentIds || b.paidTransaction)
        settlements[b.id] = b.settledPaymentIds || [b.paidTransaction!];
    }
  }
  const next: Data = {
    ...data,
    transactions: data.transactions.filter((t) => !removed.has(t.id)),
    loanPayments: (data.loanPayments || []).filter(
      (p) => !groups.some((g) => g.id === p.id),
    ),
    bills: data.bills.map((b) => ({
      ...b,
      paidTransaction: undefined,
      paymentIds: billLinks(b).filter((id) => !removed.has(id)),
      settledPaymentIds: (
        b.settledPaymentIds || (b.paidTransaction ? [b.paidTransaction] : [])
      ).some((id) => removed.has(id))
        ? undefined
        : b.settledPaymentIds ||
          (b.paidTransaction ? [b.paidTransaction] : undefined),
    })),
    deletedTransactions: [
      ...(data.deletedTransactions || []),
      {
        id: uid(),
        deletedAt: new Date().toISOString(),
        transactions: tx,
        billLinks: links,
        settlements,
        loanPayments: groups,
      },
    ],
  };
  validate(next);
  return next;
}
export function restoreTransactions(data: Data, bundleId: string): Data {
  const bundle = data.deletedTransactions?.find((b) => b.id === bundleId);
  if (!bundle) throw Error("Recovery record not found.");
  if (
    bundle.transactions.some((t) =>
      data.transactions.some(
        (x) =>
          x.id === t.id || t.importKeys?.some((k) => x.importKeys?.includes(k)),
      ),
    )
  )
    throw Error(
      "These transactions or their imported rows are already present.",
    );
  let next: Data = {
    ...data,
    transactions: [...data.transactions, ...bundle.transactions],
    loanPayments: [...(data.loanPayments || []), ...bundle.loanPayments],
    deletedTransactions: data.deletedTransactions?.filter(
      (b) => b.id !== bundleId,
    ),
    bills: data.bills.map((b) => {
      const ids = [
        ...new Set([...billLinks(b), ...(bundle.billLinks[b.id] || [])]),
      ];
      const settlement = bundle.settlements[b.id];
      return {
        ...b,
        paidTransaction: undefined,
        paymentIds: ids,
        settledPaymentIds: settlement?.every((id) => ids.includes(id))
          ? settlement
          : b.settledPaymentIds,
      };
    }),
  };
  validate(next);
  return reconcileBills(data, next);
}
export function replaceTransaction(data: Data, t: Transaction): Data {
  const group = data.loanPayments?.find((p) => p.transactionIds.includes(t.id));
  if (group)
    throw Error(
      "Edit this payment using the loan payment form so principal and interest stay together.",
    );
  const next = {
    ...data,
    transactions: data.transactions.map((x) => (x.id === t.id ? t : x)),
  };
  validate(next);
  return reconcileBills(data, next);
}
export function loanParts(data: Data, p: LoanPayment) {
  const ts = data.transactions.filter((t) => p.transactionIds.includes(t.id));
  return {
    principal: ts
      .filter((t) => t.type === "transfer" && t.loanPart !== "interest")
      .reduce((n, t) => n + t.amount, 0),
    interest: ts
      .filter((t) => t.type === "expense" || t.loanPart === "interest")
      .reduce((n, t) => n + t.amount, 0),
    date: ts[0]?.date || "",
    account: ts[0]?.account || "",
    total: ts.reduce((n, t) => n + t.amount, 0),
  };
}
export function saveLoanPayment(
  data: Data,
  input: {
    id?: string;
    loan: string;
    account: string;
    date: string;
    principal: number;
    interest: number;
    category: string;
    existingId?: string;
    interestChargeId?: string;
    billId?: string;
    settle?: boolean;
  },
): Data {
  const { loan, account, date, principal, interest, category } = input;
  const a = data.accounts.find((a) => a.id === loan);
  if (
    !a ||
    a.type !== "debt" ||
    loan === account ||
    !Number.isSafeInteger(principal) ||
    principal < 0 ||
    !Number.isSafeInteger(interest) ||
    interest < 0 ||
    principal + interest <= 0
  )
    throw Error(
      "Enter valid principal and interest amounts with a positive payment total.",
    );
  const group = data.loanPayments?.find((p) => p.id === input.id);
  const existing = input.existingId
    ? data.transactions.find((t) => t.id === input.existingId)
    : undefined;
  if (input.existingId && !existing) throw Error("Existing payment not found.");
  if (
    existing &&
    (existing.account !== account ||
      !["expense", "transfer"].includes(existing.type) ||
      existing.amount !== principal + interest ||
      existing.date !== date)
  )
    throw Error(
      "The existing payment must match the cash account, date, and full payment amount.",
    );
  if (
    existing &&
    data.loanPayments?.some((p) => p.transactionIds.includes(existing.id))
  )
    throw Error("This transaction is already a loan payment.");
  const oldIds = group?.transactionIds || (existing ? [existing.id] : []);
  if (existing?.type === "transfer" && existing.to !== loan)
    throw Error("Existing transfer must point to this loan.");
  const available = remainingPrincipal(
    {
      ...data,
      transactions: data.transactions.filter((t) => !oldIds.includes(t.id)),
    },
    loan,
  );
  const charge = input.interestChargeId
    ? data.transactions.find((t) => t.id === input.interestChargeId)
    : undefined;
  if (
    input.interestChargeId &&
    (!charge ||
      charge.type !== "expense" ||
      charge.account !== loan ||
      charge.interest !== "charged" ||
      charge.amount !== interest)
  )
    throw Error(
      "Selected recorded loan interest must match the interest payment amount.",
    );
  if (group?.interestChargeId && !input.interestChargeId && interest > 0)
    throw Error(
      "To change the recorded-interest association, delete this payment first; its existing charge will remain.",
    );
  if (principal > available)
    throw Error(
      "Principal exceeds the tracked remaining loan balance. Correct the opening balance or payment split.",
    );
  const id = group?.id || uid();
  const parts: Transaction[] = [];
  const oldPrincipal =
    group &&
    data.transactions.find(
      (t) =>
        oldIds.includes(t.id) &&
        t.type === "transfer" &&
        t.loanPart !== "interest",
    );
  const oldInterest =
    group &&
    data.transactions.find(
      (t) =>
        oldIds.includes(t.id) &&
        (t.type === "expense" || t.loanPart === "interest"),
    );
  if (principal)
    parts.push({
      id: oldPrincipal?.id || existing?.id || uid(),
      date,
      amount: principal,
      type: "transfer",
      account,
      to: loan,
      category: "",
      loanPart: "principal",
      payee: a.name + " principal",
      notes: "Loan payment",
      importKeys: existing?.importKeys || oldPrincipal?.importKeys,
    });
  if (interest)
    parts.push({
      id: oldInterest?.id || (!principal ? existing?.id : undefined) || uid(),
      date,
      amount: interest,
      type: charge ? "transfer" : "expense",
      to: charge ? loan : undefined,
      loanPart: "interest",
      account,
      category: charge ? "" : category,
      payee: a.name + " interest",
      notes: "Loan payment",
      interest: charge ? undefined : "charged",
      importKeys: !principal ? existing?.importKeys : oldInterest?.importKeys,
    });
  const receipts = [
    ...new Set(
      data.transactions
        .filter((t) => oldIds.includes(t.id))
        .flatMap((t) => t.importKeys || []),
    ),
  ];
  if (parts.length && receipts.length)
    parts[0] = {
      ...parts[0],
      importKeys: [...new Set([...(parts[0].importKeys || []), ...receipts])],
    };
  for (let i = 1; i < parts.length; i++)
    parts[i] = {
      ...parts[i],
      importKeys: parts[i].importKeys?.filter((k) => !receipts.includes(k)),
    };
  const newIds = parts.map((t) => t.id);
  let next: Data = {
    ...data,
    transactions: [
      ...data.transactions.filter((t) => !oldIds.includes(t.id)),
      ...parts,
    ],
    loanPayments: [
      ...(data.loanPayments || []).filter((p) => p.id !== id),
      {
        id,
        loan,
        transactionIds: newIds,
        interestChargeId: input.interestChargeId,
      },
    ],
    bills: data.bills.map((b) => {
      const ids = billLinks(b);
      if (!ids.some((id) => oldIds.includes(id))) return b;
      const links = [
        ...new Set([...ids.filter((id) => !oldIds.includes(id)), ...newIds]),
      ];
      return {
        ...b,
        paidTransaction: undefined,
        paymentIds: links,
        settledPaymentIds: b.settledPaymentIds ? links : undefined,
      };
    }),
  };
  if (input.billId)
    next = linkBillPayment(next, input.billId, newIds, !!input.settle);
  validate(next);
  return reconcileBills(data, next);
}
export const categoryIds = (data: Data, id: string) => [
  id,
  ...data.categories.filter((c) => c.parentId === id).map((c) => c.id),
];
export function categorySpending(data: Data, month: string, id: string) {
  const ids = categoryIds(data, id);
  return data.transactions
    .filter((t) => ids.includes(t.category) && t.date.startsWith(month))
    .reduce(
      (n, t) =>
        n +
        (t.type === "expense" ? t.amount : t.type === "refund" ? -t.amount : 0),
      0,
    );
}
// Expand each stored series only until its next stored occurrence. Paid bills
// remain planned, and materializing the next occurrence never doubles a month.
export function scheduledMinimum(
  data: Data,
  month: string,
  id: string,
): number {
  const ids = categoryIds(data, id);
  const end = month + "-31";
  let total = 0;
  for (const bill of data.bills) {
    if (bill.date > end) continue;
    const nextStored = data.bills
      .filter(
        (b) =>
          b.id !== bill.id &&
          (b.seriesId || b.id) === (bill.seriesId || bill.id) &&
          b.date > bill.date,
      )
      .sort((a, b) => a.date.localeCompare(b.date))[0]?.date;
    let occurrence = bill;
    while (
      occurrence.date <= end &&
      (!nextStored || occurrence.date < nextStored)
    ) {
      if (
        occurrence.date.startsWith(month) &&
        ids.includes(occurrence.category)
      )
        total += occurrence.amount;
      const date = nextOccurrence(occurrence);
      if (!date || date <= occurrence.date) break;
      occurrence = { ...occurrence, date };
    }
  }
  return total;
}
// Transfers consume a repayment budget only when explicitly linked to a debt
// schedule. Ordinary transfers and credit-card purchases retain ledger semantics.
export function categoryDebtPayments(data: Data, month: string, id: string) {
  const ids = categoryIds(data, id);
  const links = new Set(
    data.bills
      .filter((b) => b.loanAccount && ids.includes(b.category))
      .flatMap(billLinks),
  );
  return data.transactions
    .filter(
      (t) =>
        t.type === "transfer" && t.date.startsWith(month) && links.has(t.id),
    )
    .reduce((sum, t) => sum + t.amount, 0);
}
export const categoryBudgetUsed = (data: Data, month: string, id: string) =>
  categorySpending(data, month, id) + categoryDebtPayments(data, month, id);
export const totalBudgetUsed = (data: Data, month: string) =>
  data.categories
    .filter((c) => !c.parentId)
    .reduce((sum, c) => sum + categoryBudgetUsed(data, month, c.id), 0);

export function categoryLimit(data: Data, month: string, id: string): number {
  const c = data.categories.find((c) => c.id === id);
  if (!c) return 0;
  const children = data.categories.filter((x) => x.parentId === id);
  const childLimits = children.reduce(
    (n, child) => n + categoryLimit(data, month, child.id),
    0,
  );
  const manual = Object.hasOwn(data.budgets[month] || {}, id)
    ? data.budgets[month][id]
    : c.limit || childLimits;
  // An implicit parent rolls up child envelopes plus direct schedules. An
  // explicit parent keeps its envelope, subject to all scheduled minimums.
  const directMinimum =
    scheduledMinimum(data, month, id) -
    children.reduce(
      (n, child) => n + scheduledMinimum(data, month, child.id),
      0,
    );
  return Math.max(
    manual,
    scheduledMinimum(data, month, id),
    Object.hasOwn(data.budgets[month] || {}, id) || c.limit
      ? 0
      : childLimits + directMinimum,
  );
}
export const totalBudget = (data: Data, month: string) =>
  data.categories
    .filter((c) => !c.parentId)
    .reduce((n, c) => n + categoryLimit(data, month, c.id), 0);
export function deleteCategory(data: Data, id: string, reassign?: string) {
  const old = data.categories.find((c) => c.id === id);
  if (!old) throw Error("Category not found.");
  if (
    reassign === id ||
    (reassign && !data.categories.some((c) => c.id === reassign))
  )
    throw Error("Choose a different category.");
  const used =
    data.transactions.some((t) => t.category === id) ||
    data.bills.some((b) => b.category === id) ||
    data.deletedTransactions?.some((b) =>
      b.transactions.some((t) => t.category === id),
    );
  if (used && !reassign)
    throw Error("Choose a category for existing transactions and bills.");
  const next: Data = {
    ...data,
    categories: data.categories
      .filter((c) => c.id !== id)
      .map((c) => (c.parentId === id ? { ...c, parentId: undefined } : c)),
    transactions: data.transactions.map((t) =>
      t.category === id ? { ...t, category: reassign! } : t,
    ),
    deletedTransactions: data.deletedTransactions?.map((b) => ({
      ...b,
      transactions: b.transactions.map((t) =>
        t.category === id ? { ...t, category: reassign! } : t,
      ),
    })),
    bills: data.bills.map((b) =>
      b.category === id ? { ...b, category: reassign! } : b,
    ),
    budgets: Object.fromEntries(
      Object.entries(data.budgets).map(([month, limits]) => [
        month,
        Object.fromEntries(
          Object.entries(limits).filter(([key]) => key !== id),
        ),
      ]),
    ),
  };
  validate(next);
  return next;
}
export function cashFlow(data: Data, month: string, id: string) {
  return data.transactions
    .filter((t) => t.date.startsWith(month))
    .reduce(
      (n, t) =>
        n +
        (t.to === id ? t.amount : 0) +
        (t.account === id
          ? t.type === "income" || t.type === "refund"
            ? t.amount
            : -t.amount
          : 0),
      0,
    );
}
export const actualInterest = (
  data: Data,
  month: string,
  kind: "charged" | "earned",
) =>
  data.transactions
    .filter((t) => t.interest === kind && t.date.startsWith(month))
    .reduce((n, t) => n + t.amount, 0);

export function remainingPrincipal(data: Data, loan: string) {
  const a = data.accounts.find((a) => a.id === loan);
  if (!a) return 0;
  return Math.max(
    0,
    -balance(
      a,
      data.transactions.filter(
        (t) =>
          !(t.account === loan && t.interest === "charged") &&
          !(
            t.type === "transfer" &&
            t.to === loan &&
            t.loanPart === "interest"
          ),
      ),
    ),
  );
}

function reconcileBills(previous: Data, data: Data) {
  let next = data;
  for (const b of data.bills) {
    const before = previous.bills.find((x) => x.id === b.id);
    if (
      billStatus(data, b) === "Paid" &&
      (!before || billStatus(previous, before) !== "Paid")
    )
      next = ensureNextBill(next, b.id);
  }
  validate(next);
  return next;
}
