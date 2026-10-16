import { DebtsPanel } from "./DebtsPanel";
import { trackedDebts } from "./debts";
import { BillsPanel } from "./BillsPanel";
import { BudgetPanel } from "./BudgetPanel";
import { AccountInsights } from "./AccountInsights";
import { LoanPaymentEditor } from "./LoanPaymentEditor";
import {
  billStatus,
  billLinks,
  billPaymentTotal,
  categorySpending,
  categoryLimit,
  categoryIds,
  totalBudget,
  removeTransactions,
  restoreTransactions,
  replaceTransaction,
  actualInterest,
} from "./planning";
import { DeleteAccountDialog } from "./DeleteAccountDialog";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  House,
  ArrowLeftRight,
  Wallet,
  ChartPie,
  CalendarDays,
  Sprout,
  Settings,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Sun,
  Moon,
  LogOut,
  Download,
  Trash2,
  Pencil,
  Check,
  ChevronRight,
} from "lucide-react";
import {
  type Data,
  type Transaction,
  type Account,
  type Bill,
  empty,
  demo,
  today,
  uid,
  money,
  cents,
  balance,
  totals,
  spent,
  nextMonthly,
  validate,
} from "./ledger";
import { cloud, load, save, reviewMode } from "./storage";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import "./style.css";
const ImportDialog = React.lazy(() =>
  import("./ImportDialog").then((module) => ({ default: module.ImportDialog })),
);
const demoKey = reviewMode
  ? "hearth-fictional-review-v1"
  : "hearth-fictional-demo-v1";
const pages = [
  "Dashboard",
  "Transactions",
  "Budget",
  "Bills",
  "Debts",
  "Accounts",
  "Savings",
  "Settings",
];
const icons = [
  House,
  ArrowLeftRight,
  ChartPie,
  CalendarDays,
  Wallet,
  Wallet,
  Sprout,
  Settings,
];
function App() {
  const [mode, setMode] = useState<"login" | "demo" | "cloud">("login"),
    [user, setUser] = useState(""),
    [data, setData] = useState<Data>(empty),
    [revision, setRevision] = useState(0),
    [page, setPage] = useState("Dashboard"),
    [month, setMonth] = useState(today().slice(0, 7)),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [dark, setDark] = useState(localStorage.getItem("hearth-theme") === "dark"),
    [modal, setModal] = useState<
      | "transaction"
      | "account"
      | "bill"
      | "import"
      | "deleteAccount"
      | "loanPayment"
      | null
    >(null),
    [editing, setEditing] = useState<Transaction | undefined>(),
    [transactionDraft, setTransactionDraft] = useState<
      Partial<Transaction> | undefined
    >(),
    [editingAccount, setEditingAccount] = useState<Account | undefined>(),
    [loanDialog, setLoanDialog] = useState<{
      loan: string;
      payment?: string;
    } | null>(null),
    [search, setSearch] = useState(""),
    [filterAccount, setFilterAccount] = useState(""),
    [filterType, setFilterType] = useState(""),
    [filterCategory, setFilterCategory] = useState(""),
    [startDate, setStartDate] = useState(""),
    [endDate, setEndDate] = useState("");
  useEffect(() => {
    if (!modal) return;
    const before = document.activeElement as HTMLElement;
    const handler = (e: KeyboardEvent) => {
      const dialog = document.querySelector("[role=dialog]");
      if (!dialog) return;
      const items = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input, select, textarea",
        ),
      );
      if (e.key === "Escape" && !busy) setModal(null);
      if (e.key === "Tab" && items.length) {
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      before?.focus();
    };
  }, [modal, busy]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("hearth-theme", dark ? "dark" : "light");
  }, [dark]);
  async function openCloud(id: string) {
    setBusy(true);
    try {
      const result = await load(id);
      validate(result.data);
      setData(result.data);
      setRevision(result.revision);
      setUser(id);
      setMode("cloud");
      setError("");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!cloud) return;
    cloud.auth.getSession().then(({ data, error }) => {
      if (error) setError(error.message);
      else if (data.session) void openCloud(data.session.user.id);
    });
    const { data: subscription } = cloud.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_IN" && session)
          setTimeout(() => void openCloud(session.user.id), 0);
        if (event === "SIGNED_OUT") {
          setMode("login");
          setData(empty());
          setUser("");
        }
      },
    );
    return () => subscription.subscription.unsubscribe();
  }, []);
  async function commit(next: Data) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      validate(next);
      if (mode === "demo") localStorage.setItem(demoKey, JSON.stringify(next));
      else setRevision(await save(user, next, revision));
      setData(next);
      setNotice(
        mode === "demo"
          ? "Saved to fictional demo on this browser."
          : "Saved securely.",
      );
      return true;
    } catch (e) {
      setError(message(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  function enterDemo() {
    try {
      const raw = localStorage.getItem(demoKey);
      const d = raw ? JSON.parse(raw) : demo();
      validate(d);
      setData(d);
      setMode("demo");
      setError("");
    } catch (e) {
      setError(message(e));
    }
  }
  async function signout() {
    if (mode === "cloud") {
      const result = await cloud!.auth.signOut();
      if (result.error) {
        setError(result.error.message);
        return;
      }
    }
    setMode("login");
    setData(empty());
    setNotice("");
    setUser("");
  }
  const total = totals(data.transactions, month),
    asset = data.accounts
      .filter((a) => balance(a, data.transactions) > 0)
      .reduce((n, a) => n + balance(a, data.transactions), 0),
    owed = -data.accounts
      .filter((a) => balance(a, data.transactions) < 0)
      .reduce((n, a) => n + balance(a, data.transactions), 0);
  const accountName = (id: string) =>
    data.accounts.find((a) => a.id === id)?.name || "Unknown account";
  const categoryName = (id: string) =>
    data.categories.find((c) => c.id === id)?.name || "—";
  const rows = data.transactions
    .filter(
      (t) =>
        t.date.startsWith(month) &&
        (!filterAccount ||
          t.account === filterAccount ||
          t.to === filterAccount) &&
        (!filterType || t.type === filterType) &&
        (!filterCategory ||
          categoryIds(data, filterCategory).includes(t.category)) &&
        (!startDate || t.date >= startDate) &&
        (!endDate || t.date <= endDate) &&
        `${t.payee} ${t.notes}`.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const limit = (id: string) => categoryLimit(data, month, id);
  function addTransaction() {
    setTransactionDraft(undefined);
    setEditing(undefined);
    setModal("transaction");
  }
  async function deleteTransaction(t: Transaction) {
    if (
      !confirm(
        `Delete ${t.payee || "this transaction"}? All parts of a linked loan payment are deleted together. Balances and bill payment status recalculate. You can restore deleted transactions from Transactions.`,
      )
    )
      return;
    try {
      await commit(removeTransactions(data, [t.id]));
    } catch (e) {
      setError(message(e));
    }
  }
  function exportCSV() {
    const quote = (s: string) =>
      '"' + (/^[=+@\-\t\r]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"';
    const csv = [
      "Date,Type,Amount USD,Account,To account,Category,Payee,Notes",
      ...rows.map((t) =>
        [
          t.date,
          t.type,
          (t.amount / 100).toFixed(2),
          accountName(t.account),
          t.to ? accountName(t.to) : "",
          categoryName(t.category),
          t.payee,
          t.notes,
        ]
          .map(quote)
          .join(","),
      ),
    ].join("\r\n");
    download(csv, "hearth-transactions.csv", "text/csv");
  }
  if (mode === "login")
    return (
      <div className="welcome">
        <div className="welcome-art">
          <div className="brand">
            <span className="brand-icon">
              <House />
            </span>{" "}
            hearth<span className="brand-dot">.</span>
          </div>
          <div>
            <span className="eyebrow">A LITTLE CLARITY. A LOT MORE CALM.</span>
            <h1>
              Make room for
              <br />
              what matters.
            </h1>
            <p>Your household finances, thoughtfully in one place.</p>
            <div className="welcome-card">
              <Sprout size={32} />
              <div>
                A clearer picture of your money.
                <br />
                <small>Every account. Every everyday decision.</small>
              </div>
            </div>
          </div>
          <small>Built for your household. No bank connections.</small>
        </div>
        <main className="login">
          <span className="eyebrow">WELCOME HOME</span>
          <h2>Your money, in view.</h2>
          {reviewMode && (
            <div className="notice">
              Review build · fictional data only. Cloud sign-in is disabled; use
              Explore fictional demo.
            </div>
          )}
          <p>Sign in to your private household budget.</p>
          {error && (
            <div role="alert" className="alert">
              {error}
            </div>
          )}
          {notice && <p role="status">{notice}</p>}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              const f = new FormData(e.currentTarget);
              if (!cloud) {
                setError(
                  "Online storage is not configured yet. Follow README.md to connect Supabase, or explore the fictional demo.",
                );
                return;
              }
              setBusy(true);
              const { error } = await cloud.auth.signInWithPassword({
                email: String(f.get("email")),
                password: String(f.get("password")),
              });
              if (error) setError(error.message);
              setBusy(false);
            }}
          >
            <label>
              Email address
              <input
                name="email"
                disabled={reviewMode}
                type="email"
                autoComplete="username"
                required
                placeholder="you@example.com"
              />
            </label>
            <label>
              Password
              <input
                name="password"
                disabled={reviewMode}
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
              />
            </label>
            <button className="primary" disabled={busy || reviewMode}>
              Sign in <ArrowUpRight size={17} />
            </button>
          </form>
          <p className="small">
            One private account for your household. Account creation is managed
            in your Supabase project.
          </p>
          <div className="divider">TAKE A LOOK AROUND</div>
          <button className="secondary" onClick={enterDemo}>
            Explore fictional demo <ChevronRight size={16} />
          </button>
          <p className="small">
            No sign-up needed. Demo data stays in this browser and is separate
            from your real finances.
          </p>
        </main>
      </div>
    );
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <span className="brand-icon">
            <House size={21} />
          </span>{" "}
          hearth<span className="brand-dot">.</span>
        </div>
        <div className="household">
          <span className="avatar">H</span>
          <div>
            Our household
            <small>
              {mode === "demo" ? "Fictional demo" : "Private workspace"}
            </small>
          </div>
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav aria-label="Main navigation">
          {pages.map((p, i) => {
            const Icon = icons[i];
            return (
              <button
                key={p}
                className={page === p ? "active" : ""}
                onClick={() => setPage(p)}
              >
                <Icon size={19} />
                {p}
                {page === p && <span className="nav-dot" />}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="calm">
            <Sprout size={23} />
            <strong>A little progress, every day.</strong>
            <p>Small steps build a more comfortable tomorrow.</p>
          </div>
          <button className="plain" onClick={() => setDark(!dark)}>
            {dark ? <Sun size={18} /> : <Moon size={18} />}{" "}
            {dark ? "Light" : "Dark"} appearance
          </button>
          <button
            className="plain"
            disabled={busy}
            onClick={() => void signout()}
          >
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header>
          <div className="breadcrumb">
            Our household <span>/</span> <strong>{page}</strong>
          </div>
          <div className="header-actions">
            <span className="private">
              ● {mode === "demo" ? "Local demo" : "Private & secure"}
            </span>
            <span className="avatar">H</span>
            <button
              className="header-signout"
              aria-label="Sign out"
              disabled={busy}
              onClick={() => void signout()}
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>
        <main className="content">
          {mode === "demo" && (
            <div className="demo-banner">
              {reviewMode ? "REVIEW MODE · CLOUD DISABLED" : "FICTIONAL DEMO"}{" "}
              <span>
                Explore freely. Saved only on this browser; no cross-device
                sync.
              </span>
            </div>
          )}
          <div className="page-heading">
            <div>
              <span className="eyebrow">YOUR HOUSEHOLD, AT A GLANCE</span>
              <h1>
                {page === "Dashboard" ? "A little clarity for your day." : page}
              </h1>
              <p>
                {page === "Dashboard"
                  ? "Know where you stand. Plan what comes next."
                  : {
                      Transactions:
                        "The everyday details that make up the bigger picture.",
                      Accounts: "Every balance, with a place and a purpose.",
                      Budget: "Give your month a thoughtful plan.",
                      Bills: "Keep the next due date in sight.",
                      Debts:
                        "Your remaining balances, with a plan for each payment.",
                      Savings: "Make space for your future.",
                      Settings: "Your workspace, your way.",
                    }[page]}
              </p>
            </div>
            <div className="heading-actions">
              <button
                className="secondary"
                disabled={!data.accounts.length || busy}
                onClick={() => {
                  setError("");
                  setModal("import");
                }}
              >
                Import CSV
              </button>
              <label className="month-label">
                <span className="sr-only">Selected month</span>
                <input
                  type="month"
                  value={month}
                  required
                  onChange={(e) => e.target.value && setMonth(e.target.value)}
                />
              </label>
              <button
                className="primary"
                onClick={addTransaction}
                disabled={!data.accounts.length || busy}
              >
                <Plus size={18} />
                Add transaction
              </button>
            </div>
          </div>
          {error && (
            <div className="alert" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              {notice}
            </div>
          )}
          {busy && <div role="status">Saving or loading…</div>}
          {page === "Dashboard" && (
            <>
              <div className="stats">
                <Stat
                  title="NET WORTH"
                  value={money(asset - owed)}
                  detail={`${money(asset)} assets · ${money(owed)} owed`}
                  icon={<Wallet />}
                />
                <Stat
                  title="INCOME RECEIVED"
                  value={money(total.income)}
                  detail="Actual take-home pay this month"
                  icon={<ArrowDownLeft />}
                />
                <Stat
                  title="MONTHLY SPENDING"
                  value={money(total.spent)}
                  detail="Expenses less refunds · no transfers"
                  icon={<ArrowUpRight />}
                />
                <Stat
                  title="BUDGET REMAINING"
                  value={money(totalBudget(data, month) - total.spent)}
                  detail="Your plan, separate from balances"
                  icon={<ChartPie />}
                />
              </div>
              <section className="panel monthly-net">
                <h2>
                  Monthly net income:{" "}
                  <span
                    className={total.income - total.spent < 0 ? "warning" : ""}
                  >
                    {money(total.income - total.spent)}
                  </span>
                </h2>
                <p>
                  Actual income minus expenses after refunds. Transfers and
                  opening balances do not change this number. Actual interest
                  charged: {money(actualInterest(data, month, "charged"))};
                  interest earned:{" "}
                  {money(actualInterest(data, month, "earned"))}.
                </p>
              </section>
              <div className="dashboard-grid">
                <section className="panel budget-panel">
                  <PanelTitle
                    title="Your monthly plan"
                    sub="A little intention goes a long way."
                    action="View budget"
                    onClick={() => setPage("Budget")}
                  />
                  {data.categories
                    .filter((c) => !c.archived && !c.parentId)
                    .slice(0, 5)
                    .map((c, i) => {
                      const used = categorySpending(data, month, c.id),
                        max = limit(c.id);
                      return (
                        <div className="budget-row" key={c.id}>
                          <div className={`category-icon color-${i % 4}`}>
                            <ChartPie size={17} />
                          </div>
                          <div className="budget-detail">
                            <div>
                              <strong>{c.name}</strong>
                              <span>
                                {money(used)} <small>of {money(max)}</small>
                              </span>
                            </div>
                            <div className="progress">
                              <i
                                className={used > max ? "over" : ""}
                                style={{
                                  width: `${Math.min(100, max ? Math.max(0, (used / max) * 100) : used > 0 ? 100 : 0)}%`,
                                }}
                              />
                            </div>
                          </div>
                          <small className={used > max ? "warning" : ""}>
                            {used > max
                              ? "Over budget"
                              : money(max - used) + " left"}
                          </small>
                        </div>
                      );
                    })}
                  <div className="panel-footer">
                    <span className="legend-dot" /> Spending includes credit
                    card purchases, never card payments.
                  </div>
                </section>
                <section className="panel">
                  <PanelTitle
                    title="Your accounts"
                    sub="The real balances behind the plan."
                    action="View all"
                    onClick={() => setPage("Accounts")}
                  />
                  {data.accounts.map((a) => (
                    <div className="account-row" key={a.id}>
                      <span className="account-icon">
                        <Wallet size={20} />
                      </span>
                      <div>
                        <strong>{a.name}</strong>
                        <small>
                          {a.type === "credit" ? "Credit card" : a.type}
                        </small>
                      </div>
                      <strong>{money(balance(a, data.transactions))}</strong>
                    </div>
                  ))}
                  {!data.accounts.length && (
                    <Empty text="Add an account and its opening balance to get started." />
                  )}
                  <div className="panel-footer">
                    Opening balances are excluded from income.
                  </div>
                </section>
                <section className="panel">
                  <PanelTitle
                    title="Recent activity"
                    sub="The latest from your household ledger."
                    action="View transactions"
                    onClick={() => setPage("Transactions")}
                  />
                  {rows.slice(0, 4).map((t) => (
                    <div className="activity" key={t.id}>
                      <span className={"transaction-icon " + t.type}>
                        {t.type === "income" ? (
                          <ArrowDownLeft size={18} />
                        ) : (
                          <ArrowUpRight size={18} />
                        )}
                      </span>
                      <div>
                        <strong>{t.payee || t.type}</strong>
                        <small>
                          {categoryName(t.category)} · {t.date}
                        </small>
                      </div>
                      <strong>
                        {t.type === "income" || t.type === "refund" ? "+" : "−"}
                        {money(t.amount)}
                      </strong>
                    </div>
                  ))}
                  {!rows.length && (
                    <Empty text="No activity this month. Add your first transaction." />
                  )}
                </section>
                <section className="panel">
                  <PanelTitle
                    title="Coming up"
                    sub="A heads-up for the days ahead."
                    action="View bills"
                    onClick={() => setPage("Bills")}
                  />
                  {data.bills
                    .filter((b) => billStatus(data, b) !== "Paid")
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .slice(0, 4)
                    .map((b) => (
                      <div className="bill-row" key={b.id}>
                        <div className="date-tile">
                          <small>
                            {new Date(b.date + "T12:00:00").toLocaleString(
                              "en-US",
                              { month: "short" },
                            )}
                          </small>
                          <strong>{b.date.slice(-2)}</strong>
                        </div>
                        <div>
                          <strong>{b.name}</strong>
                          <small className={b.date <= today() ? "warning" : ""}>
                            {b.date < today()
                              ? "Overdue"
                              : b.date === today()
                                ? "Due today"
                                : "Upcoming"}
                          </small>
                        </div>
                        <strong>{money(b.amount)}</strong>
                      </div>
                    ))}
                  {!data.bills.some((b) => billStatus(data, b) !== "Paid") && (
                    <Empty text="Nothing due. Add a bill to keep track of upcoming payments." />
                  )}
                  <div className="panel-footer">
                    In-app reminders only. No alerts when the app is closed.
                  </div>
                </section>
              </div>
              <div className="gentle-note">
                <Sprout size={20} />
                <p>
                  A budget is a guide, not a grade.{" "}
                  <strong>You’re making room for what matters.</strong>
                </p>
              </div>
            </>
          )}
          {page === "Accounts" && (
            <>
              <button
                className="secondary"
                onClick={() => {
                  setEditingAccount(undefined);
                  setError("");
                  setModal("account");
                }}
              >
                <Plus size={17} />
                Add account
              </button>
              <div className="account-cards">
                {data.accounts.map((a) => (
                  <section className="panel" key={a.id}>
                    <Wallet />
                    <h2>{a.name}</h2>
                    <span className="tag">{a.type}</span>
                    <h1>{money(balance(a, data.transactions))}</h1>
                    <p>
                      Opening {money(a.opening)} on {a.date}
                    </p>
                    <small>Negative balances represent money owed.</small>
                    <AccountInsights
                      account={a}
                      data={data}
                      month={month}
                      busy={busy}
                      onPay={() => {
                        setLoanDialog({ loan: a.id });
                        setModal("loanPayment");
                        setError("");
                      }}
                      onEdit={(id) => {
                        setLoanDialog({ loan: a.id, payment: id });
                        setModal("loanPayment");
                        setError("");
                      }}
                      onDelete={(id) => {
                        const t = data.transactions.find((t) => t.id === id);
                        if (t) void deleteTransaction(t);
                      }}
                    />
                    <button
                      className="secondary account-edit-button"
                      disabled={busy}
                      aria-label={`Edit ${a.name} account`}
                      onClick={() => {
                        setEditingAccount(a);
                        setError("");
                        setModal("account");
                      }}
                    >
                      Edit account
                    </button>
                    <button
                      className="danger-text account-edit-button"
                      disabled={busy}
                      aria-label={`Delete ${a.name} account`}
                      onClick={() => {
                        setEditingAccount(a);
                        setError("");
                        setNotice("");
                        setModal("deleteAccount");
                      }}
                    >
                      <Trash2 size={16} />
                      Delete account
                    </button>
                  </section>
                ))}
              </div>
              {!data.accounts.length && (
                <Empty text="Start with checking, savings, cash, a credit card, or another debt." />
              )}
            </>
          )}
          {page === "Transactions" && (
            <section className="panel">
              <div className="filters">
                <label>
                  Search
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Payee or notes"
                  />
                </label>
                <label>
                  Account
                  <select
                    value={filterAccount}
                    onChange={(e) => setFilterAccount(e.target.value)}
                  >
                    <option value="">All accounts</option>
                    {data.accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Type
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                  >
                    <option value="">All types</option>
                    {["expense", "income", "transfer", "refund"].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Category
                  <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                  >
                    <option value="">All categories</option>
                    {data.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  From
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </label>
                <label>
                  To
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </label>
                <button className="secondary" onClick={exportCSV}>
                  <Download size={16} />
                  CSV
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date / payee</th>
                      <th>Category</th>
                      <th>Account</th>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <strong>{t.payee || "Transfer"}</strong>
                          <small>
                            {t.date}
                            {t.notes && " · " + t.notes}
                          </small>
                        </td>
                        <td>{categoryName(t.category)}</td>
                        <td>
                          {accountName(t.account)}
                          {t.to && " → " + accountName(t.to)}
                        </td>
                        <td>
                          <span className="tag">{t.type}</span>
                        </td>
                        <td className="numeric">{money(t.amount)}</td>
                        <td>
                          <div className="row-actions">
                            <button
                              aria-label={`Edit ${t.payee}`}
                              onClick={() => {
                                setTransactionDraft(undefined);
                                const payment = data.loanPayments?.find((p) =>
                                  p.transactionIds.includes(t.id),
                                );
                                if (payment) {
                                  setLoanDialog({
                                    loan: payment.loan,
                                    payment: payment.id,
                                  });
                                  setModal("loanPayment");
                                } else {
                                  setEditing(t);
                                  setModal("transaction");
                                }
                              }}
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              disabled={busy}
                              aria-label={`Delete ${t.payee}`}
                              onClick={() => void deleteTransaction(t)}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!rows.length && (
                <Empty text="No transactions match this month and these filters." />
              )}
            </section>
          )}
          {page === "Transactions" && !!data.deletedTransactions?.length && (
            <section className="panel recovery">
              <h2>Recently deleted transactions</h2>
              <p>
                Restoring also restores valid bill and loan links. Deleted
                accounts/categories must exist before a transaction can be
                restored.
              </p>
              {data.deletedTransactions.map((bundle) => (
                <div className="recovery-row" key={bundle.id}>
                  <span>
                    {bundle.transactions.map((t) => t.payee).join(" + ")} ·{" "}
                    {bundle.deletedAt.slice(0, 10)}
                  </span>
                  <button
                    disabled={busy}
                    onClick={() => {
                      try {
                        void commit(restoreTransactions(data, bundle.id));
                      } catch (e) {
                        setError(message(e));
                      }
                    }}
                  >
                    Restore transaction
                  </button>
                </div>
              ))}
            </section>
          )}
          {page === "Budget" && (
            <BudgetPanel
              data={data}
              month={month}
              busy={busy}
              onSave={commit}
            />
          )}
          {page === "Bills" && (
            <BillsPanel
              data={data}
              busy={busy}
              onSave={commit}
              scope="ordinary"
              debtAccountIds={trackedDebts(data).map((a) => a.id)}
            />
          )}
          {page === "Debts" && (
            <DebtsPanel
              data={data}
              month={month}
              busy={busy}
              onSave={commit}
              onAdd={() => {
                setEditingAccount(undefined);
                setError("");
                setModal("account");
              }}
              onEdit={(a) => {
                setEditingAccount(a);
                setError("");
                setModal("account");
              }}
              onPay={(a) => {
                setError("");
                if (a.type === "credit") {
                  setEditing(undefined);
                  setTransactionDraft({
                    type: "transfer",
                    to: a.id,
                    account: data.accounts.find((x) =>
                      ["checking", "savings", "cash"].includes(x.type),
                    )?.id,
                    payee: `Payment to ${a.name}`,
                  });
                  setModal("transaction");
                } else {
                  setLoanDialog({ loan: a.id });
                  setModal("loanPayment");
                }
              }}
              onEditPayment={(loan, id) => {
                setLoanDialog({ loan, payment: id });
                setModal("loanPayment");
                setError("");
              }}
              onDeletePayment={(id) => {
                const t = data.transactions.find((t) => t.id === id);
                if (t) void deleteTransaction(t);
              }}
            />
          )}
          {page === "Savings" && (
            <section className="panel">
              <Sprout size={32} />
              <h2>A foundation for your future</h2>
              <p>
                Your savings accounts hold{" "}
                {money(
                  data.accounts
                    .filter((a) => a.type === "savings")
                    .reduce((n, a) => n + balance(a, data.transactions), 0),
                )}
                .
              </p>
              <p>
                Record contributions as transfers to keep spending accurate.
                Goal allocations and target-date planning are planned for the
                next stage.
              </p>
              <button className="secondary" onClick={addTransaction}>
                Record a transfer
              </button>
            </section>
          )}
          {page === "Settings" && (
            <section className="panel settings">
              <h2>Workspace settings</h2>
              <p>
                Currency: USD · Dates: local calendar dates · Storage:{" "}
                {mode === "demo"
                  ? "this browser, fictional demo only"
                  : "Supabase, authenticated household"}
              </p>
              <button className="secondary" onClick={() => setDark(!dark)}>
                Switch to {dark ? "light" : "dark"} mode
              </button>
              <h3>Data export</h3>
              <p>
                CSV exports the selected month and filters. Full JSON exports
                all currently implemented account, ledger, category, budget, and
                bill data.
              </p>
              <button
                className="secondary"
                onClick={() =>
                  download(
                    JSON.stringify({ version: 1, data }, null, 2),
                    "hearth-backup.json",
                    "application/json",
                  )
                }
              >
                <Download size={16} />
                Download full JSON
              </button>
              <p>
                Validated replacement restore will be added in a later stage.
                Keep this backup in a private location.
              </p>
              {mode === "cloud" && (
                <button
                  className="secondary"
                  onClick={() => void openCloud(user)}
                >
                  Reload from cloud
                </button>
              )}
              <h3>Current release</h3>
              <p>
                Accounts, manual transactions, monthly budgets and basic bill
                occurrences. Income schedules, savings goals, projections,
                reports, calendar, full restore and advanced bill editing remain
                planned.
              </p>
            </section>
          )}
          <footer>
            hearth. <span>A calmer relationship with your money.</span>
            <small>
              USD ·{" "}
              {mode === "demo" ? "Fictional sample data" : "Private household"}
            </small>
          </footer>
        </main>
      </div>
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setModal(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            className={modal === "import" ? "modal import-modal" : "modal"}
          >
            <div className="modal-heading">
              <h2 id="modal-title">
                {modal === "loanPayment"
                  ? "Loan payment"
                  : modal === "deleteAccount"
                    ? "Delete account"
                    : modal === "import"
                      ? "Import transactions"
                      : modal === "transaction"
                        ? editing
                          ? "Edit transaction"
                          : "Add transaction"
                        : modal === "account"
                          ? editingAccount
                            ? page === "Debts"
                              ? "Edit debt"
                              : "Edit account"
                            : page === "Debts"
                              ? "Add debt"
                              : "Add account"
                          : "Add bill"}
              </h2>
              <button
                disabled={busy}
                aria-label="Close dialog"
                onClick={() => setModal(null)}
              >
                ✕
              </button>
            </div>
            {error && (
              <div className="alert" role="alert">
                {error}
              </div>
            )}
            {modal === "loanPayment" && loanDialog ? (
              <LoanPaymentEditor
                data={data}
                loanId={loanDialog.loan}
                paymentId={loanDialog.payment}
                busy={busy}
                onSave={commit}
                onCancel={() => setModal(null)}
              />
            ) : modal === "deleteAccount" && editingAccount ? (
              <DeleteAccountDialog
                data={data}
                accountId={editingAccount.id}
                busy={busy}
                onCancel={() => setModal(null)}
                onSave={async (next) => {
                  const saved = await commit(next);
                  if (saved) {
                    if (filterAccount === editingAccount.id)
                      setFilterAccount("");
                    setModal(null);
                    setEditingAccount(undefined);
                  }
                  return saved;
                }}
              />
            ) : modal === "import" ? (
              <React.Suspense
                fallback={<p role="status">Loading CSV importer…</p>}
              >
                <ImportDialog
                  data={data}
                  busy={busy}
                  onSave={async (next) => {
                    const saved = await commit(next);
                    if (saved) setModal(null);
                    return saved;
                  }}
                />
              </React.Suspense>
            ) : (
              <EntryForm
                kind={modal}
                debtOnly={page === "Debts"}
                data={data}
                editing={editing}
                draft={transactionDraft}
                initialAccount={
                  modal === "account" ? editingAccount : undefined
                }
                busy={busy}
                onSave={async (next) => {
                  try {
                    const update =
                      modal === "transaction" && editing
                        ? replaceTransaction(
                            data,
                            next.transactions.find((t) => t.id === editing.id)!,
                          )
                        : next;
                    if (await commit(update)) setModal(null);
                  } catch (e) {
                    setError(message(e));
                  }
                }}
                onError={setError}
              />
            )}
            <p className="small">
              {modal === "deleteAccount"
                ? "Deletion is saved only after your confirmation."
                : modal === "import"
                  ? "Files are never committed to GitHub. Keep original exports and backups in a private location."
                  : modal === "account"
                    ? "Use a negative opening balance for money owed. Opening balances are not income."
                    : modal === "transaction"
                      ? "Credit card payments and savings contributions are transfers. For debt payments, record principal as a transfer and interest or fees as separate expenses."
                      : "Paying records exactly one expense for this occurrence."}
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
function EntryForm({
  kind,
  data,
  editing,
  draft,
  initialAccount,
  debtOnly = false,
  busy,
  onSave,
  onError,
}: {
  kind: string;
  data: Data;
  editing?: Transaction;
  draft?: Partial<Transaction>;
  initialAccount?: Account;
  debtOnly?: boolean;
  busy: boolean;
  onSave: (d: Data) => Promise<void>;
  onError: (s: string) => void;
}) {
  const [type, setType] = useState(editing?.type || draft?.type || "expense");
  const [accountType, setAccountType] = useState(
    initialAccount?.type || "checking",
  );
  const [localError, setLocalError] = useState("");
  const accountSelect = (name: string, label: string, value?: string) => (
    <label>
      {label}
      <select name={name} defaultValue={value} required>
        {data.accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget),
          get = (s: string) => String(f.get(s) || "");
        setLocalError("");
        try {
          let next: Data;
          if (kind === "account") {
            const a: Account = {
              id: initialAccount?.id || uid(),
              name: get("name").trim(),
              type: get("accountType") as Account["type"],
              opening: cents(get("opening")),
              date: get("date"),
              rateBps: get("rate").trim() ? cents(get("rate")) : undefined,
              originalPrincipal: get("originalPrincipal").trim()
                ? cents(get("originalPrincipal"))
                : undefined,
              expectedPayment: get("expectedPayment").trim()
                ? cents(get("expectedPayment"))
                : undefined,
            };
            if (
              initialAccount &&
              (a.opening !== initialAccount.opening ||
                a.date !== initialAccount.date) &&
              !confirm(
                "Change the opening balance/date? All balances will be recalculated. Use the balance immediately before your imported transactions; avoid counting them twice.",
              )
            )
              return;
            next = {
              ...data,
              debtPreferences:
                data.debtPreferences || (debtOnly && a.type === "credit")
                  ? {
                      creditAccountIds: [
                        ...new Set([
                          ...(
                            data.debtPreferences?.creditAccountIds || []
                          ).filter((id) => id !== a.id || a.type === "credit"),
                          ...(!initialAccount && debtOnly && a.type === "credit"
                            ? [a.id]
                            : []),
                        ]),
                      ],
                    }
                  : undefined,
              accounts: initialAccount
                ? data.accounts.map((x) => (x.id === a.id ? a : x))
                : [...data.accounts, a],
            };
          } else if (kind === "bill") {
            const amount = cents(get("amount"));
            if (amount <= 0) throw Error("Amount must be positive.");
            const b: Bill = {
              id: uid(),
              name: get("name").trim(),
              amount,
              date: get("date"),
              account: get("account"),
              category: get("category"),
              frequency: get("frequency") as Bill["frequency"],
              anchor: Number(get("date").slice(-2)),
            };
            next = { ...data, bills: [...data.bills, b] };
          } else {
            const t: Transaction = {
              id: editing?.id || uid(),
              type,
              amount: cents(get("amount")),
              date: get("date"),
              account: get("account"),
              to: type === "transfer" ? get("to") : undefined,
              category:
                type === "expense" || type === "refund" ? get("category") : "",
              payee: get("payee").trim(),
              notes: get("notes").trim(),
              interest:
                (get("interest") as Transaction["interest"]) || undefined,
              importKeys: editing?.importKeys,
            };
            next = {
              ...data,
              transactions: editing
                ? data.transactions.map((x) => (x.id === editing.id ? t : x))
                : [...data.transactions, t],
            };
          }
          validate(next);
          await onSave(next);
        } catch (e) {
          setLocalError(message(e));
          onError(message(e));
        }
      }}
    >
      {localError && (
        <div className="alert" role="alert">
          {localError}
        </div>
      )}
      {kind === "transaction" ? (
        <>
          <label>
            Transaction type
            <select
              value={type}
              onChange={(e) => setType(e.target.value as Transaction["type"])}
            >
              {["expense", "income", "transfer", "refund"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            {type === "income" ? "Income source" : "Payee / description"}
            <input
              autoFocus
              name="payee"
              defaultValue={editing?.payee || draft?.payee}
              required
              maxLength={120}
            />
          </label>
        </>
      ) : (
        <label>
          Name
          <input
            name="name"
            defaultValue={initialAccount?.name}
            autoFocus
            required
            maxLength={120}
          />
        </label>
      )}
      {kind === "account" ? (
        <>
          <label>
            Account type
            <select
              name="accountType"
              value={accountType}
              onChange={(e) =>
                setAccountType(e.target.value as Account["type"])
              }
            >
              {(debtOnly
                ? ["debt", "credit"]
                : ["checking", "savings", "cash", "credit", "debt"]
              ).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Opening balance (USD)
            <input
              name="opening"
              inputMode="decimal"
              defaultValue={
                initialAccount
                  ? (initialAccount.opening / 100).toFixed(2)
                  : "0.00"
              }
              required
            />
          </label>
        </>
      ) : (
        <label>
          Amount (USD)
          <input
            name="amount"
            inputMode="decimal"
            defaultValue={editing ? (editing.amount / 100).toFixed(2) : ""}
            placeholder="0.00"
            required
          />
        </label>
      )}
      <label>
        {kind === "account"
          ? "Opening balance date"
          : kind === "bill"
            ? "Due date"
            : "Transaction date"}
        <input
          name="date"
          type="date"
          defaultValue={initialAccount?.date || editing?.date || today()}
          required
        />
      </label>
      {kind === "account" && (
        <>
          <label>
            Annual rate (%) ·{" "}
            {accountType === "savings" || accountType === "checking"
              ? "APY"
              : "APR"}
            <input
              name="rate"
              inputMode="decimal"
              defaultValue={
                initialAccount?.rateBps === undefined
                  ? ""
                  : (initialAccount.rateBps / 100).toFixed(2)
              }
              placeholder="Optional"
            />
          </label>
          <label>
            Original loan amount (USD, debt accounts only)
            <input
              name="originalPrincipal"
              inputMode="decimal"
              defaultValue={
                initialAccount?.originalPrincipal === undefined
                  ? ""
                  : (initialAccount.originalPrincipal / 100).toFixed(2)
              }
              placeholder="Optional"
            />
          </label>
          <label>
            {accountType === "credit"
              ? "Expected monthly card payment (USD)"
              : "Expected monthly loan payment (USD)"}
            <input
              name="expectedPayment"
              inputMode="decimal"
              defaultValue={
                initialAccount?.expectedPayment === undefined
                  ? ""
                  : (initialAccount.expectedPayment / 100).toFixed(2)
              }
              placeholder="Optional"
            />
          </label>
        </>
      )}
      {kind === "transaction" && (type === "expense" || type === "income") && (
        <label>
          Interest classification
          <select name="interest" defaultValue={editing?.interest || ""}>
            <option value="">Ordinary transaction</option>
            {type === "expense" ? (
              <option value="charged">Actual interest charged</option>
            ) : (
              <option value="earned">Actual interest earned</option>
            )}
          </select>
        </label>
      )}
      {kind !== "account" &&
        accountSelect(
          "account",
          type === "transfer" && kind === "transaction"
            ? "From account"
            : "Account",
          editing?.account || draft?.account,
        )}
      {kind === "transaction" &&
        type === "transfer" &&
        accountSelect("to", "To account", editing?.to || draft?.to)}
      {(kind === "bill" ||
        (kind === "transaction" &&
          (type === "expense" || type === "refund"))) && (
        <label>
          Category
          <select name="category" defaultValue={editing?.category} required>
            {data.categories
              .filter((c) => !c.archived || c.id === editing?.category)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
      )}
      {kind === "bill" && (
        <label>
          Repeat
          <select name="frequency">
            <option value="once">One time</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
      )}
      {kind === "transaction" && (
        <label>
          Notes (optional)
          <textarea
            name="notes"
            defaultValue={editing?.notes}
            maxLength={1000}
          />
        </label>
      )}
      <button className="primary" disabled={busy}>
        {busy
          ? "Saving…"
          : "Save " + (debtOnly && kind === "account" ? "debt" : kind)}
      </button>
    </form>
  );
}
function message(e: unknown) {
  return e instanceof Error
    ? e.message
    : typeof e === "object" && e && "message" in e
      ? String(e.message)
      : "Could not save. Please try again.";
}
function download(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
function Stat({
  title,
  value,
  detail,
  icon,
}: {
  title: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <section className="stat">
      <div>
        <span>{title}</span>
        {icon}
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </section>
  );
}
function PanelTitle({
  title,
  sub,
  action,
  onClick,
}: {
  title: string;
  sub: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="panel-title">
      <div>
        <h2>{title}</h2>
        <p>{sub}</p>
      </div>
      {action && (
        <button className="text-button" onClick={onClick}>
          {action}
          <ChevronRight size={14} />
        </button>
      )}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <Sprout size={26} />
      <p>{text}</p>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
