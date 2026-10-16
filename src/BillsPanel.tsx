import { useState, useEffect } from "react";
import { type Data, type Bill, cents, uid, today, money } from "./ledger";
import {
  billLinks,
  billStatus,
  billPaymentTotal,
  editBill,
  deleteBill,
  recordBillPayment,
  linkBillPayment,
  unlinkBill,
  removeTransactions,
} from "./planning";
import { LoanPaymentEditor } from "./LoanPaymentEditor";
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Could not save.";
export function BillsPanel({
  data,
  busy,
  onSave,
  scope = "all",
  debtAccountIds = [],
  selectedDebtId,
}: {
  data: Data;
  busy: boolean;
  onSave: (d: Data) => Promise<boolean>;
  scope?: "all" | "ordinary" | "debts";
  debtAccountIds?: string[];
  selectedDebtId?: string;
}) {
  const [editing, setEditing] = useState<string | null>(null),
    [paying, setPaying] = useState<string | null>(null),
    [reopening, setReopening] = useState<string | null>(null),
    [error, setError] = useState("");
  const visibleBills = data.bills.filter(
    (b) =>
      scope === "all" ||
      (scope === "ordinary"
        ? !debtAccountIds.includes(b.loanAccount || "")
        : debtAccountIds.includes(b.loanAccount || "") &&
          (!selectedDebtId || b.loanAccount === selectedDebtId)),
  );
  const selected = visibleBills.find((b) => b.id === paying);
  const debtFilterKey = debtAccountIds.join(",");
  useEffect(() => {
    setEditing(null);
    setPaying(null);
    setReopening(null);
    setError("");
  }, [scope, selectedDebtId, debtFilterKey]);
  async function store(next: Data) {
    const ok = await onSave(next);
    if (ok) {
      setEditing(null);
      setPaying(null);
      setReopening(null);
      setError("");
    }
    return ok;
  }
  return (
    <section className="panel">
      <div className="panel-title">
        <div>
          <h2>
            {scope === "debts"
              ? "Debt payments & due dates"
              : "Bills & due dates"}
          </h2>
          <p>
            Expected amounts stay separate from recorded payments. Editing bills
            never rewrites their transactions.
          </p>
        </div>
        <button
          onClick={() => {
            setEditing("new");
            setPaying(null);
            setError("");
          }}
          disabled={
            busy ||
            !data.accounts.length ||
            (scope === "debts" && !debtAccountIds.length)
          }
        >
          {scope === "debts" ? "Add debt payment schedule" : "Add bill"}
        </button>
      </div>
      {error && (
        <div role="alert" className="alert">
          {error}
        </div>
      )}
      {editing && (
        <BillEditor
          key={editing}
          data={data}
          bill={data.bills.find((b) => b.id === editing)}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSave={store}
          debtOnly={scope === "debts"}
          debtAccountIds={debtAccountIds}
          defaultDebtId={selectedDebtId || debtAccountIds[0]}
        />
      )}
      {selected &&
        (selected.loanAccount &&
        data.accounts.find((a) => a.id === selected.loanAccount)?.type ===
          "debt" ? (
          <LoanPaymentEditor
            key={selected.id}
            data={data}
            loanId={selected.loanAccount}
            billId={selected.id}
            busy={busy}
            onSave={store}
            onCancel={() => setPaying(null)}
          />
        ) : (
          <BillPaymentForm
            key={selected.id}
            data={data}
            bill={selected}
            busy={busy}
            onSave={store}
            onCancel={() => setPaying(null)}
          />
        ))}
      {[...visibleBills]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((b) => {
          const status = billStatus(data, b),
            links = billLinks(b);
          return (
            <article className="bill-detail" key={b.id}>
              <div className="bill-row">
                <div className="date-tile">
                  <small>{b.date.slice(0, 7)}</small>
                  <strong>{b.date.slice(-2)}</strong>
                </div>
                <div>
                  <strong>{b.name}</strong>
                  <small>
                    {b.frequency} ·{" "}
                    {data.accounts.find((a) => a.id === b.account)?.name} ·{" "}
                    {status}
                    {status !== "Paid" && b.date < today() ? " · Overdue" : ""}
                  </small>
                </div>
                <div>
                  <strong>Expected {money(b.amount)}</strong>
                  <small>Actual paid {money(billPaymentTotal(data, b))}</small>
                </div>
              </div>
              <div className="row-actions bill-actions">
                <button
                  disabled={busy}
                  onClick={() => {
                    setPaying(b.id);
                    setEditing(null);
                    setError("");
                  }}
                >
                  {status === "Paid" ? "Add/link payment" : "Pay & record"}
                </button>
                <button
                  aria-label={`Edit ${b.name} bill`}
                  disabled={busy}
                  onClick={() => {
                    setEditing(b.id);
                    setPaying(null);
                    setError("");
                  }}
                >
                  Edit bill
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    if (
                      !confirm(
                        `Delete only this bill occurrence, ${b.name}? Recorded payment transactions will remain.`,
                      )
                    )
                      return;
                    void store(deleteBill(data, b.id, "one"));
                  }}
                >
                  Delete occurrence
                </button>
                {b.frequency !== "once" && (
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (
                        confirm(
                          "Delete this occurrence and future unpaid occurrences in this series? Historical transactions and paid occurrences will remain.",
                        )
                      )
                        void store(deleteBill(data, b.id, "future"));
                    }}
                  >
                    Delete this & future
                  </button>
                )}
                {links.length > 0 && (
                  <button disabled={busy} onClick={() => setReopening(b.id)}>
                    Mark unpaid
                  </button>
                )}
              </div>
              {links.length > 0 && (
                <details>
                  <summary>
                    Payment history ({links.length} ledger entries)
                  </summary>
                  {links.map((id) => {
                    const t = data.transactions.find((t) => t.id === id);
                    return (
                      t && (
                        <p key={id}>
                          {t.date} · {t.payee} · {money(t.amount)}
                        </p>
                      )
                    );
                  })}
                </details>
              )}
              {reopening === b.id && (
                <div className="alert">
                  <p>
                    Choose what happens to the linked payment. Keeping
                    transactions removes only the bill association; deleting
                    payments also reverses their cash/loan effects and supports
                    recovery.
                  </p>
                  <button
                    disabled={busy}
                    onClick={() => void store(unlinkBill(data, b.id))}
                  >
                    Keep transactions; unlink bill
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (
                        confirm(
                          "Delete linked payments, including all parts of linked loan payments, and reopen this bill?",
                        )
                      )
                        void store(removeTransactions(data, links));
                    }}
                  >
                    Delete payments & reopen
                  </button>
                  <button onClick={() => setReopening(null)}>Cancel</button>
                </div>
              )}
            </article>
          );
        })}
      {!visibleBills.length && (
        <p className="empty">
          {scope === "debts"
            ? "No scheduled payments for these debts. Add a schedule to track due dates and actual payments."
            : "Add your first bill. Autopay does not prove payment."}
        </p>
      )}
      <p className="small">
        Reminders are in-app only; no notifications when closed. A lower final
        payment requires explicit settlement.
      </p>
    </section>
  );
}
function BillEditor({
  data,
  bill,
  busy,
  onCancel,
  onSave,
  debtOnly = false,
  debtAccountIds = [],
  defaultDebtId,
}: {
  data: Data;
  bill?: Bill;
  busy: boolean;
  onCancel: () => void;
  onSave: (d: Data) => Promise<boolean>;
  debtOnly?: boolean;
  debtAccountIds?: string[];
  defaultDebtId?: string;
}) {
  const [error, setError] = useState("");
  return (
    <form
      className="inline-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          const f = new FormData(e.currentTarget),
            date = String(f.get("date"));
          const patch = {
            name: String(f.get("name")).trim(),
            amount: cents(String(f.get("amount"))),
            date,
            account: String(f.get("account")),
            category: String(f.get("category")),
            frequency: String(f.get("frequency")) as Bill["frequency"],
            loanAccount: String(f.get("loan")) || undefined,
          };
          if (debtOnly && !patch.loanAccount)
            throw Error("Choose the debt this schedule pays.");
          if (patch.loanAccount === patch.account)
            throw Error(
              "The payment account and debt account must be different.",
            );
          const next = bill
            ? editBill(
                data,
                bill.id,
                patch,
                String(f.get("scope")) as "one" | "future",
              )
            : {
                ...data,
                bills: [
                  ...data.bills,
                  { ...patch, id: uid(), anchor: Number(date.slice(-2)) },
                ],
              };
          await onSave(next);
        } catch (e) {
          setError(message(e));
        }
      }}
    >
      <h3>
        {debtOnly
          ? bill
            ? "Edit debt payment schedule"
            : "Add debt payment schedule"
          : bill
            ? "Edit bill"
            : "Add bill"}
      </h3>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      <label>
        {debtOnly ? "Payment schedule name" : "Bill name"}
        <input name="name" defaultValue={bill?.name} required maxLength={120} />
      </label>
      <label>
        Expected amount (USD)
        <input
          name="amount"
          defaultValue={bill ? String(bill.amount / 100) : ""}
          inputMode="decimal"
          required
        />
      </label>
      <label>
        Due date
        <input
          name="date"
          type="date"
          defaultValue={bill?.date || today()}
          required
        />
      </label>
      <label>
        Repeat
        <select name="frequency" defaultValue={bill?.frequency || "once"}>
          {["once", "weekly", "biweekly", "monthly", "quarterly", "yearly"].map(
            (x) => (
              <option key={x}>{x}</option>
            ),
          )}
        </select>
      </label>
      <label>
        Payment account
        <select
          name="account"
          defaultValue={
            bill?.account ||
            (debtOnly
              ? data.accounts.find((a) =>
                  ["checking", "savings", "cash"].includes(a.type),
                )?.id
              : undefined)
          }
        >
          {data.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Category or subcategory
        <select name="category" defaultValue={bill?.category}>
          {data.categories
            .filter((c) => !c.archived || c.id === bill?.category)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.parentId ? "↳ " : ""}
                {c.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        {debtOnly
          ? "Debt account"
          : "Tracked loan or credit card payment (optional)"}
        <select
          name="loan"
          defaultValue={bill?.loanAccount || (debtOnly ? defaultDebtId : "")}
          required={debtOnly}
        >
          <option value="">
            {debtOnly ? "Choose a debt" : "Ordinary bill"}
          </option>
          {data.accounts
            .filter(
              (a) =>
                ["debt", "credit"].includes(a.type) &&
                (!debtOnly || debtAccountIds.includes(a.id)),
            )
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
        </select>
      </label>
      {bill && (
        <label>
          Apply changes to
          <select name="scope" defaultValue="one">
            <option value="one">This occurrence only</option>
            <option value="future">This and future unpaid occurrences</option>
          </select>
        </label>
      )}
      <div className="delete-actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button disabled={busy} className="primary">
          {debtOnly ? "Save payment schedule" : "Save bill"}
        </button>
      </div>
    </form>
  );
}
function BillPaymentForm({
  data,
  bill,
  busy,
  onSave,
  onCancel,
}: {
  data: Data;
  bill: Bill;
  busy: boolean;
  onSave: (d: Data) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [existing, setExisting] = useState(""),
    [error, setError] = useState("");
  return (
    <form
      className="inline-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          const f = new FormData(e.currentTarget),
            settle = f.get("settle") === "on";
          await onSave(
            existing
              ? linkBillPayment(data, bill.id, [existing], settle)
              : recordBillPayment(
                  data,
                  bill.id,
                  cents(String(f.get("amount"))),
                  String(f.get("date")),
                  settle,
                ),
          );
        } catch (e) {
          setError(message(e));
        }
      }}
    >
      <h3>Payment for {bill.name}</h3>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      <label>
        Existing transaction
        <select value={existing} onChange={(e) => setExisting(e.target.value)}>
          <option value="">Record a new actual payment</option>
          {data.transactions
            .filter(
              (t) =>
                t.account === bill.account &&
                ["expense", "transfer"].includes(t.type) &&
                !data.bills.some((b) => billLinks(b).includes(t.id)),
            )
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.date} · {t.payee} · {money(t.amount)}
              </option>
            ))}
        </select>
      </label>
      {!existing && (
        <>
          <label>
            Actual payment amount (USD)
            <input
              name="amount"
              defaultValue={String(
                Math.max(0, bill.amount - billPaymentTotal(data, bill)) / 100,
              )}
              inputMode="decimal"
              required
            />
          </label>
          <label>
            Actual payment date
            <input type="date" name="date" defaultValue={today()} required />
          </label>
        </>
      )}
      <label className="import-confirm">
        <input type="checkbox" name="settle" />
        This is the final payment; settle for this total even if the expected
        amount differs.
      </label>
      <div className="delete-actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="primary" disabled={busy}>
          Save bill payment
        </button>
      </div>
    </form>
  );
}
