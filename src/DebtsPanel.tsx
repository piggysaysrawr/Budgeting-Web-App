import { useState } from "react";
import { type Data, type Account, money } from "./ledger";
import { trackedDebts, debtSummary, trackCreditCard } from "./debts";
import { billPaymentTotal } from "./planning";
import { BillsPanel } from "./BillsPanel";
import { AccountInsights } from "./AccountInsights";

export function DebtsPanel({
  data,
  month,
  busy,
  onSave,
  onAdd,
  onEdit,
  onPay,
  onEditPayment,
  onDeletePayment,
}: {
  data: Data;
  month: string;
  busy: boolean;
  onSave: (d: Data) => Promise<boolean>;
  onAdd: () => void;
  onEdit: (a: Account) => void;
  onPay: (a: Account) => void;
  onEditPayment: (loan: string, id: string) => void;
  onDeletePayment: (id: string) => void;
}) {
  const [selected, setSelected] = useState(""),
    [error, setError] = useState("");
  const accounts = trackedDebts(data),
    ids = accounts.map((a) => a.id);
  const active = ids.includes(selected) ? selected : "";
  return (
    <>
      <section className="panel debt-overview">
        <div className="panel-title">
          <div>
            <h2>Your debts</h2>
            <p>
              Recorded balances, payment schedules, and history. Loan principal
              and interest stay separate.
            </p>
          </div>
          <button className="primary" onClick={onAdd} disabled={busy}>
            Add debt
          </button>
        </div>
        <div className="debt-summary">
          <div>
            <small>TOTAL REMAINING BALANCE</small>
            <strong>
              {money(
                accounts.reduce((n, a) => n + debtSummary(data, a).owed, 0),
              )}
            </strong>
          </div>
          <div>
            <small>NEXT SCHEDULED PAYMENTS</small>
            <strong>
              {money(
                accounts.reduce((n, a) => {
                  const next = debtSummary(data, a).next;
                  return (
                    n +
                    (next
                      ? Math.max(0, next.amount - billPaymentTotal(data, next))
                      : 0)
                  );
                }, 0),
              )}
            </strong>
          </div>
          <p className="small">
            Only debts shown here are included. Card overpayments are credits,
            not negative debt. The next-payment total uses unpaid schedules and
            deducts recorded partial payments; it is separate from remaining
            debt.
          </p>
        </div>
        {error && (
          <div role="alert" className="alert">
            {error}
          </div>
        )}
        <details className="debt-card-options">
          <summary>Credit cards (optional)</summary>
          <p className="small">
            Paid-in-full cards can stay in Accounts. Select any card you want to
            monitor here; this does not duplicate the account or transactions.
          </p>
          {data.accounts
            .filter((a) => a.type === "credit")
            .map((a) => (
              <label className="import-confirm" key={a.id}>
                <input
                  type="checkbox"
                  checked={ids.includes(a.id)}
                  disabled={busy}
                  onChange={async (e) => {
                    try {
                      setError("");
                      await onSave(
                        trackCreditCard(data, a.id, e.target.checked),
                      );
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : "Could not update cards.",
                      );
                    }
                  }}
                />
                Show {a.name} in Debts
              </label>
            ))}
          {!data.accounts.some((a) => a.type === "credit") && (
            <p>Add a credit-card account to make it available here.</p>
          )}
        </details>
      </section>
      <div className="debt-cards">
        {accounts.map((a) => {
          const summary = debtSummary(data, a);
          return (
            <article className="panel debt-card" key={a.id}>
              <span className="tag">
                {a.type === "credit" ? "Credit card" : "Loan / debt"}
              </span>
              <h2>{a.name}</h2>
              <p>Remaining balance</p>
              <strong className="debt-remaining">{money(summary.owed)}</strong>
              {summary.credit > 0 && (
                <p>Account credit: {money(summary.credit)}</p>
              )}
              {summary.next ? (
                <p>
                  Next unpaid payment:{" "}
                  <strong>
                    {summary.next.date} · {summary.next.name}
                  </strong>
                </p>
              ) : (
                <p>No unpaid payment scheduled.</p>
              )}
              <AccountInsights
                account={a}
                data={data}
                month={month}
                busy={busy}
                onPay={() => onPay(a)}
                onEdit={(id) => onEditPayment(a.id, id)}
                onDelete={onDeletePayment}
              />
              <div className="debt-actions">
                {a.type === "credit" && (
                  <button
                    disabled={
                      busy ||
                      !data.accounts.some((a) =>
                        ["checking", "savings", "cash"].includes(a.type),
                      )
                    }
                    onClick={() => onPay(a)}
                  >
                    Record card payment
                  </button>
                )}
                <button disabled={busy} onClick={() => onEdit(a)}>
                  Edit debt details
                </button>
                <button disabled={busy} onClick={() => setSelected(a.id)}>
                  View payment schedule
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {!accounts.length && (
        <section className="panel empty">
          <h2>No debts tracked here yet</h2>
          <p>
            Add a loan with its current remaining balance, or include an
            existing credit card above. Existing account data stays in Accounts.
          </p>
        </section>
      )}
      <label className="debt-filter">
        Payment schedules for
        <select value={active} onChange={(e) => setSelected(e.target.value)}>
          <option value="">All debts shown here</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <BillsPanel
        data={data}
        busy={busy}
        onSave={onSave}
        scope="debts"
        debtAccountIds={ids}
        selectedDebtId={active || undefined}
      />
      <p className="small debt-help">
        A payment still listed under Bills can be associated with its debt using
        Edit bill → Tracked loan or credit card payment. Existing transactions
        are preserved. Dashboard alerts continue to include scheduled payments.
      </p>
    </>
  );
}
