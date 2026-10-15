import { useState } from "react";
import { type Data, cents, today } from "./ledger";
import { saveLoanPayment, loanParts } from "./planning";
export function LoanPaymentEditor({
  data,
  loanId,
  paymentId,
  billId,
  busy,
  onSave,
  onCancel,
}: {
  data: Data;
  loanId: string;
  paymentId?: string;
  billId?: string;
  busy: boolean;
  onSave: (d: Data) => Promise<boolean>;
  onCancel: () => void;
}) {
  const group = data.loanPayments?.find((p) => p.id === paymentId),
    parts = group ? loanParts(data, group) : undefined;
  const bill = data.bills.find((b) => b.id === billId);
  const [error, setError] = useState(""),
    [account, setAccount] = useState(
      parts?.account ||
        bill?.account ||
        data.accounts.find(
          (a) =>
            a.id !== loanId && ["checking", "savings", "cash"].includes(a.type),
        )?.id ||
        "",
    ),
    [date, setDate] = useState(parts?.date || today()),
    [principal, setPrincipal] = useState(
      parts ? String(parts.principal / 100) : "",
    ),
    [interest, setInterest] = useState(
      parts ? String(parts.interest / 100) : "0.00",
    ),
    [existing, setExisting] = useState("");
  const candidates = data.transactions.filter(
    (t) =>
      t.account === account &&
      t.date === date &&
      ["expense", "transfer"].includes(t.type) &&
      (t.type !== "transfer" || t.to === loanId) &&
      !data.loanPayments?.some((p) => p.transactionIds.includes(t.id)),
  );
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          const f = new FormData(e.currentTarget);
          const next = saveLoanPayment(data, {
            id: paymentId,
            loan: loanId,
            account,
            date,
            principal: cents(principal),
            interest: cents(interest),
            category: String(f.get("category")),
            existingId: existing || undefined,
            interestChargeId: String(f.get("interestCharge")) || undefined,
            billId,
            settle: f.get("settle") === "on",
          });
          if (await onSave(next)) onCancel();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not save payment.");
        }
      }}
    >
      <h3>{paymentId ? "Edit" : "Record"} loan payment</h3>
      <p>
        Principal reduces the debt. Interest is spending. Together they equal
        the cash leaving your payment account. Enter actual statement amounts;
        rates never create charges automatically.
      </p>
      {error && (
        <div role="alert" className="alert">
          {error}
        </div>
      )}
      <label>
        Payment account
        <select
          value={account}
          onChange={(e) => {
            setAccount(e.target.value);
            setExisting("");
          }}
          required
        >
          {data.accounts
            .filter(
              (a) =>
                a.id !== loanId &&
                ["checking", "savings", "cash"].includes(a.type),
            )
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        Payment date
        <input
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setExisting("");
          }}
          required
        />
      </label>
      <label>
        Principal (USD)
        <input
          inputMode="decimal"
          value={principal}
          onChange={(e) => setPrincipal(e.target.value)}
          required
        />
      </label>
      <label>
        Interest (USD)
        <input
          inputMode="decimal"
          value={interest}
          onChange={(e) => setInterest(e.target.value)}
          required
        />
      </label>
      <label>
        Interest category
        <select
          name="category"
          defaultValue={
            parts
              ? data.transactions.find(
                  (t) =>
                    group?.transactionIds.includes(t.id) &&
                    t.type === "expense",
                )?.category
              : bill?.category
          }
        >
          {data.categories
            .filter((c) => !c.archived)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        Interest already charged on this loan (optional)
        <select
          name="interestCharge"
          defaultValue={group?.interestChargeId || ""}
        >
          <option value="">Record interest expense with this payment</option>
          {data.transactions
            .filter(
              (t) =>
                t.account === loanId &&
                t.type === "expense" &&
                t.interest === "charged" &&
                !(data.loanPayments || []).some(
                  (p) => p.id !== paymentId && p.interestChargeId === t.id,
                ),
            )
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.date} · {t.payee} · ${(t.amount / 100).toFixed(2)}
              </option>
            ))}
        </select>
      </label>
      <p className="small">
        If interest was already recorded against the loan, choose that charge.
        Its payment becomes a transfer and does not expense it again. The
        selected charge must equal the interest amount.
      </p>
      {!paymentId && (
        <label>
          Link/split an existing full payment instead of adding another
          <select
            value={existing}
            onChange={(e) => setExisting(e.target.value)}
          >
            <option value="">Create a new payment</option>
            {candidates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.date} · {t.payee} · ${(t.amount / 100).toFixed(2)}
              </option>
            ))}
          </select>
        </label>
      )}
      {billId && (
        <label className="import-confirm">
          <input type="checkbox" name="settle" />
          This is the final payment; settle the bill even if its expected amount
          differs.
        </label>
      )}
      <div className="delete-actions">
        <button type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button className="primary" disabled={busy || !account}>
          Save loan payment
        </button>
      </div>
    </form>
  );
}
