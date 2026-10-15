import { useState } from "react";
import { Trash2 } from "lucide-react";
import { type Data, money, balance } from "./ledger";
import { planAccountDeletion } from "./accountDeletion";

export function DeleteAccountDialog({
  data,
  accountId,
  busy,
  onSave,
  onCancel,
}: {
  data: Data;
  accountId: string;
  busy: boolean;
  onSave: (next: Data) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(""),
    [acknowledged, setAcknowledged] = useState(false);
  // A successful save updates household data before the parent closes this dialog.
  // Do not plan deletion again after that account has been removed.
  if (!data.accounts.some((account) => account.id === accountId)) {
    return <p role="status">The account has been removed.</p>;
  }
  const plan = planAccountDeletion(data, accountId);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (name !== plan.account.name || !acknowledged || busy) return;
        await onSave(plan.next);
      }}
    >
      <p>
        Delete <strong>{plan.account.name}</strong> and its current balance of{" "}
        <strong>{money(balance(plan.account, data.transactions))}</strong> from
        your household?
      </p>
      <div className="alert">
        <strong>This permanently removes:</strong>
        <ul>
          <li>The account and its opening balance.</li>
          <li>
            {plan.transactions.length} linked transactions, including{" "}
            {plan.transactions.filter((t) => t.type === "transfer").length}{" "}
            transfers.
          </li>
          <li>
            {plan.bills.length} linked bill occurrences, including paid and
            upcoming bills.
          </li>
        </ul>
        {plan.affectedAccounts.length > 0 && (
          <p>
            Removing transfers also changes the balances of:{" "}
            <strong>
              {plan.affectedAccounts.map((a) => a.name).join(", ")}
            </strong>
            . Both sides of each transfer are removed together.
          </p>
        )}
        {plan.reopenedBills.length > 0 && (
          <p>
            {plan.reopenedBills.length} bills on other accounts will become
            unpaid because their payment transactions are removed.
          </p>
        )}
        <p>
          Income, spending, budgets, reports, and net worth will be
          recalculated. This does not close your bank account or delete your
          Supabase login.
        </p>
      </div>
      <p className="small">
        To keep your transaction history, cancel instead. You can download a
        full JSON export in Settings before deleting. There is no undo.
      </p>
      <label>
        Type the account name to confirm
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          disabled={busy}
          placeholder={plan.account.name}
        />
      </label>
      <label className="import-confirm">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          disabled={busy}
        />
        I understand that linked data will be deleted and other balances may
        change.
      </label>
      <div className="delete-actions">
        <button
          type="button"
          className="secondary"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="danger-button"
          disabled={busy || name !== plan.account.name || !acknowledged}
        >
          <Trash2 size={16} />
          {busy ? "Deleting…" : "Permanently delete account"}
        </button>
      </div>
    </form>
  );
}
