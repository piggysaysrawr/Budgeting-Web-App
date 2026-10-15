import { type Account, type Data, money, balance } from "./ledger";
import {
  cashFlow,
  loanParts,
  actualInterest,
  remainingPrincipal,
} from "./planning";
export function AccountInsights({
  account,
  data,
  month,
  busy,
  onPay,
  onDelete,
  onEdit,
}: {
  account: Account;
  data: Data;
  month: string;
  busy: boolean;
  onPay: () => void;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const payments = (data.loanPayments || [])
    .filter((p) => p.loan === account.id)
    .sort((a, b) =>
      loanParts(data, b).date.localeCompare(loanParts(data, a).date),
    );
  return (
    <div className="account-insights">
      <p>
        Monthly account cash flow:{" "}
        <strong>{money(cashFlow(data, month, account.id))}</strong> (includes
        transfers)
      </p>
      {account.rateBps !== undefined && (
        <p>
          {account.type === "savings" || account.type === "checking"
            ? "APY"
            : "APR"}
          : {(account.rateBps / 100).toFixed(2)}%
        </p>
      )}
      {account.type === "debt" && (
        <>
          <p>
            Original loan:{" "}
            {account.originalPrincipal === undefined
              ? "Not set"
              : money(account.originalPrincipal)}
          </p>
          <p>
            Remaining principal: {money(remainingPrincipal(data, account.id))}
          </p>
          <p>
            Expected monthly payment:{" "}
            {account.expectedPayment === undefined
              ? "Not set"
              : money(account.expectedPayment)}
          </p>
          <button
            disabled={
              busy ||
              !data.accounts.some(
                (a) =>
                  ["checking", "savings", "cash"].includes(a.type) &&
                  a.id !== account.id,
              )
            }
            onClick={onPay}
          >
            Record loan payment
          </button>
          {payments.length > 0 && (
            <details>
              <summary>Loan payment history ({payments.length})</summary>
              {payments.map((p) => {
                const parts = loanParts(data, p);
                return (
                  <div className="loan-history" key={p.id}>
                    <p>
                      {parts.date} · Principal {money(parts.principal)} ·
                      Interest {money(parts.interest)} · Total cash{" "}
                      {money(parts.total)}
                    </p>
                    <button disabled={busy} onClick={() => onEdit(p.id)}>
                      Edit payment
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => onDelete(p.transactionIds[0])}
                    >
                      Delete payment
                    </button>
                  </div>
                );
              })}
            </details>
          )}
        </>
      )}
      {(account.type === "savings" ||
        account.type === "credit" ||
        account.type === "debt") && (
        <p className="small">
          Rates are reference values only. Record actual interest as an
          interest-tagged transaction; no estimates are posted automatically.
        </p>
      )}
    </div>
  );
}
