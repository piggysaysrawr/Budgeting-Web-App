export type Account = {
  id: string;
  name: string;
  type: "checking" | "savings" | "cash" | "credit" | "debt";
  opening: number;
  date: string;
  rateBps?: number;
  originalPrincipal?: number;
  expectedPayment?: number;
};
export type Transaction = {
  id: string;
  date: string;
  amount: number;
  type: "expense" | "income" | "transfer" | "refund";
  account: string;
  to?: string;
  category: string;
  payee: string;
  notes: string;
  interest?: "charged" | "earned";
  loanPart?: "principal" | "interest";
  importKeys?: string[];
};
export type Category = {
  id: string;
  name: string;
  limit: number;
  archived?: boolean;
  parentId?: string;
};
export type Bill = {
  id: string;
  name: string;
  amount: number;
  date: string;
  account: string;
  category: string;
  frequency:
    "once" | "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";
  anchor: number;
  paidTransaction?: string;
  seriesId?: string;
  paymentIds?: string[];
  settledPaymentIds?: string[];
  loanAccount?: string;
};
export type LoanPayment = {
  interestChargeId?: string;
  id: string;
  loan: string;
  transactionIds: string[];
};
export type DeletedTransactions = {
  id: string;
  deletedAt: string;
  transactions: Transaction[];
  billLinks: Record<string, string[]>;
  settlements: Record<string, string[]>;
  loanPayments: LoanPayment[];
};

export type Data = {
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  bills: Bill[];
  budgets: Record<string, Record<string, number>>;
  debtPreferences?: { creditAccountIds: string[] };
  loanPayments?: LoanPayment[];
  deletedTransactions?: DeletedTransactions[];
};
export const today = () => new Intl.DateTimeFormat("en-CA").format(new Date());
export const uid = () => crypto.randomUUID();
export const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n / 100,
  );
export function cents(s: string) {
  if (!/^-?\d+(\.\d{1,2})?$/.test(s))
    throw Error("Enter a dollar amount with no more than two decimal places.");
  const negative = s.startsWith("-");
  const [a, b = ""] = s.replace("-", "").split(".");
  const n = Number(a) * 100 + Number(b.padEnd(2, "0"));
  if (!Number.isSafeInteger(n) || n > 100_000_000_00)
    throw Error("Amount is too large.");
  return negative ? -n : n;
}
export function balance(a: Account, ts: Transaction[]) {
  return ts.reduce(
    (n, t) =>
      n +
      (t.to === a.id ? t.amount : 0) +
      (t.account === a.id
        ? t.type === "income" || t.type === "refund"
          ? t.amount
          : -t.amount
        : 0),
    a.opening,
  );
}
export function totals(ts: Transaction[], month: string) {
  const rows = ts.filter((t) => t.date.startsWith(month));
  return {
    income: rows
      .filter((t) => t.type === "income")
      .reduce((n, t) => n + t.amount, 0),
    spent: rows.reduce(
      (n, t) =>
        n +
        (t.type === "expense" ? t.amount : t.type === "refund" ? -t.amount : 0),
      0,
    ),
  };
}
export const spent = (ts: Transaction[], month: string, category: string) =>
  totals(
    ts.filter((t) => t.category === category),
    month,
  ).spent;
export function nextMonthly(date: string, anchor: number) {
  const [y, m] = date.split("-").map(Number);
  const year = m === 12 ? y + 1 : y;
  const month = m === 12 ? 1 : m + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(anchor, last)).padStart(2, "0")}`;
}
export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const parsed = new Date(value + "T12:00:00Z");
  return (
    !isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  );
}
export function validate(d: Data) {
  if (
    !d ||
    !Array.isArray(d.accounts) ||
    !Array.isArray(d.transactions) ||
    !Array.isArray(d.categories) ||
    !Array.isArray(d.bills) ||
    !d.budgets ||
    typeof d.budgets !== "object" ||
    Array.isArray(d.budgets)
  )
    throw Error("Invalid household data.");
  const amount = (n: unknown) =>
    typeof n === "number" &&
    Number.isSafeInteger(n) &&
    Math.abs(n) <= 100_000_000_00;
  const text = (s: unknown, max = 120) =>
    typeof s === "string" && s.trim().length > 0 && s.length <= max;
  for (const list of [d.accounts, d.transactions, d.categories, d.bills]) {
    const seen = new Set<string>();
    for (const row of list) {
      if (!row || !text(row.id) || seen.has(row.id))
        throw Error("Invalid or duplicate record identifier.");
      seen.add(row.id);
    }
  }
  const ids = new Set(d.accounts.map((a) => a.id));
  const categories = new Set(d.categories.map((c) => c.id));
  for (const a of d.accounts)
    if (
      !text(a.name) ||
      !["checking", "savings", "cash", "credit", "debt"].includes(a.type) ||
      !amount(a.opening) ||
      !validDate(a.date)
    )
      throw Error("Invalid account.");
  for (const c of d.categories)
    if (!text(c.name) || !amount(c.limit) || c.limit < 0)
      throw Error("Invalid category limit.");
  for (const t of d.transactions) {
    if (
      !amount(t.amount) ||
      t.amount <= 0 ||
      !ids.has(t.account) ||
      !validDate(t.date) ||
      !["expense", "income", "transfer", "refund"].includes(t.type) ||
      !text(t.payee) ||
      typeof t.notes !== "string" ||
      t.notes.length > 1000
    )
      throw Error(
        "Invalid transaction. Check its date, amount, payee, and account.",
      );
    if (
      t.type === "transfer" &&
      (!t.to || !ids.has(t.to) || t.to === t.account)
    )
      throw Error("Choose two different transfer accounts.");
    if (t.type !== "transfer" && t.to)
      throw Error("Only transfers can have a destination account.");
    if (
      (t.type === "expense" || t.type === "refund") &&
      !categories.has(t.category)
    )
      throw Error("Choose a category.");
    for (const a of d.accounts.filter(
      (a) => a.id === t.account || a.id === t.to,
    ))
      if (t.date < a.date)
        throw Error(`Transaction predates ${a.name}'s opening balance.`);
  }
  const paid = new Set<string>();
  for (const b of d.bills) {
    if (
      !text(b.name) ||
      !amount(b.amount) ||
      b.amount <= 0 ||
      !validDate(b.date) ||
      !ids.has(b.account) ||
      !categories.has(b.category) ||
      ![
        "once",
        "weekly",
        "biweekly",
        "monthly",
        "quarterly",
        "yearly",
      ].includes(b.frequency) ||
      !Number.isInteger(b.anchor) ||
      b.anchor < 1 ||
      b.anchor > 31
    )
      throw Error("Invalid bill.");
    const links = [
      ...new Set([
        ...(b.paymentIds || []),
        ...(b.paidTransaction ? [b.paidTransaction] : []),
      ]),
    ];
    for (const id of links) {
      const t = d.transactions.find((t) => t.id === id);
      if (paid.has(id) || !t || !["expense", "transfer"].includes(t.type))
        throw Error("Invalid or duplicated bill payment link.");
      paid.add(id);
    }
    if (b.settledPaymentIds?.some((id) => !links.includes(id)))
      throw Error("Invalid bill settlement.");
    if (
      b.loanAccount &&
      !d.accounts.some(
        (a) => a.id === b.loanAccount && ["debt", "credit"].includes(a.type),
      )
    )
      throw Error("Invalid bill loan account.");
  }
  for (const [month, limits] of Object.entries(d.budgets)) {
    if (
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
      !limits ||
      typeof limits !== "object" ||
      Array.isArray(limits)
    )
      throw Error("Invalid monthly budget.");
    for (const [id, n] of Object.entries(limits))
      if (!categories.has(id) || !amount(n) || n < 0)
        throw Error("Invalid budget limit.");
  }
  for (const a of d.accounts) {
    if (
      a.rateBps !== undefined &&
      (!Number.isInteger(a.rateBps) || a.rateBps < 0 || a.rateBps > 100000)
    )
      throw Error(
        "Annual rate must be between 0 and 1000%, with two decimal places.",
      );
    for (const n of [a.originalPrincipal, a.expectedPayment])
      if (n !== undefined && (!amount(n) || n < 0))
        throw Error("Invalid loan amount.");
  }
  for (const c of d.categories)
    if (c.parentId) {
      const parent = d.categories.find((p) => p.id === c.parentId);
      if (!parent || parent.id === c.id || parent.parentId)
        throw Error("Only one level of subcategories is supported.");
    }
  for (const t of d.transactions) {
    if (
      t.interest &&
      !(
        (t.interest === "charged" && t.type === "expense") ||
        (t.interest === "earned" && t.type === "income")
      )
    )
      throw Error(
        "Interest charges must be expenses and interest earned must be income.",
      );
    if (
      t.importKeys &&
      (!Array.isArray(t.importKeys) ||
        t.importKeys.some((k) => typeof k !== "string" || k.length > 500))
    )
      throw Error("Invalid import reference.");
  }
  const loanTx = new Set<string>();
  for (const p of d.loanPayments || []) {
    const loan = d.accounts.find((a) => a.id === p.loan);
    if (
      !loan ||
      loan.type !== "debt" ||
      !p.transactionIds.length ||
      new Set(p.transactionIds).size !== p.transactionIds.length
    )
      throw Error("Invalid loan payment.");
    if (p.interestChargeId) {
      const charge = d.transactions.find((t) => t.id === p.interestChargeId);
      const paidInterest = p.transactionIds.reduce(
        (n, id) =>
          n +
          (d.transactions.find((t) => t.id === id && t.loanPart === "interest")
            ?.amount || 0),
        0,
      );
      if (
        !charge ||
        charge.account !== p.loan ||
        charge.type !== "expense" ||
        charge.interest !== "charged" ||
        charge.amount !== paidInterest ||
        (d.loanPayments || []).some(
          (other) =>
            other.id !== p.id && other.interestChargeId === p.interestChargeId,
        )
      )
        throw Error("Invalid or duplicated recorded loan interest charge.");
    }
    const tx = p.transactionIds.map((id) =>
      d.transactions.find((t) => t.id === id),
    );
    if (
      tx.some((t) => !t) ||
      new Set(tx.map((t) => t!.account)).size !== 1 ||
      new Set(tx.map((t) => t!.date)).size !== 1
    )
      throw Error("Loan payment parts must share a cash account and date.");
    for (const t of tx) {
      if (
        !t ||
        loanTx.has(t.id) ||
        t.account === p.loan ||
        !(
          (t.type === "transfer" && t.to === p.loan) ||
          (t.type === "expense" && t.interest === "charged")
        )
      )
        throw Error("Invalid or duplicated loan payment part.");
      loanTx.add(t.id);
    }
  }
  if (
    new Set((d.loanPayments || []).map((p) => p.id)).size !==
    (d.loanPayments || []).length
  )
    throw Error("Duplicate loan payment.");
  for (const bundle of d.deletedTransactions || []) {
    if (
      !bundle.id ||
      !Array.isArray(bundle.transactions) ||
      !bundle.billLinks ||
      !bundle.settlements ||
      !Array.isArray(bundle.loanPayments)
    )
      throw Error("Invalid recovery record.");
  }
  if (d.debtPreferences) {
    const ids = d.debtPreferences.creditAccountIds;
    if (
      !Array.isArray(ids) ||
      new Set(ids).size !== ids.length ||
      ids.some(
        (id) => !d.accounts.some((a) => a.id === id && a.type === "credit"),
      )
    )
      throw Error("Invalid tracked credit cards.");
  }
}
export function empty(): Data {
  return {
    accounts: [],
    transactions: [],
    categories: [
      "Housing",
      "Utilities",
      "Groceries",
      "Dining out",
      "Transportation",
      "Insurance",
      "Entertainment",
      "Miscellaneous",
    ].map((name) => ({ id: uid(), name, limit: 0 })),
    bills: [],
    budgets: {},
  };
}
export function demo(): Data {
  const d = empty(),
    day = today(),
    month = day.slice(0, 7);
  d.accounts = [
    {
      id: "checking",
      name: "Everyday checking",
      type: "checking",
      opening: 324500,
      date: month + "-01",
    },
    {
      id: "savings",
      name: "Rainy day savings",
      type: "savings",
      opening: 580000,
      date: month + "-01",
    },
    {
      id: "card",
      name: "Everyday credit card",
      type: "credit",
      opening: -24800,
      date: month + "-01",
    },
  ];
  d.categories.forEach(
    (c, i) =>
      (c.limit = [140000, 22000, 45000, 15000, 20000, 18000, 10000, 12000][i]),
  );
  d.transactions = [
    {
      id: uid(),
      date: day,
      amount: 245000,
      type: "income",
      account: "checking",
      category: "",
      payee: "Demo · Northstar Studio",
      notes: "Fictional take-home paycheck",
    },
    {
      id: uid(),
      date: day,
      amount: 7850,
      type: "expense",
      account: "checking",
      category: d.categories[2].id,
      payee: "Demo · Green Market",
      notes: "",
    },
    {
      id: uid(),
      date: day,
      amount: 4200,
      type: "expense",
      account: "card",
      category: d.categories[3].id,
      payee: "Demo · Sunday Café",
      notes: "",
    },
    {
      id: uid(),
      date: day,
      amount: 25000,
      type: "transfer",
      account: "checking",
      to: "savings",
      category: "",
      payee: "Rainy day contribution",
      notes: "",
    },
  ];
  d.bills = [
    {
      id: uid(),
      name: "Demo · Internet",
      amount: 6500,
      date: day,
      account: "checking",
      category: d.categories[1].id,
      frequency: "monthly",
      anchor: Number(day.slice(-2)),
    },
  ];
  return d;
}
