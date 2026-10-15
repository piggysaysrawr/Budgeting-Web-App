import { useState } from "react";
import { Upload, ArrowLeft, Check } from "lucide-react";
import { type Data, money, balance, type Transaction } from "./ledger";
import {
  parseCSV,
  guessMapping,
  previewRows,
  applyReviewedImport,
  type CSVFile,
  type Mapping,
  type ImportRow,
  type Profile,
} from "./importer";

export function ImportDialog({
  data,
  busy,
  onSave,
}: {
  data: Data;
  busy: boolean;
  onSave: (next: Data) => Promise<boolean>;
}) {
  const [file, setFile] = useState<CSVFile | null>(null),
    [profile, setProfile] = useState<Profile>("sofi"),
    [mapping, setMapping] = useState<Mapping | null>(null),
    [account, setAccount] = useState(data.accounts[0]?.id || ""),
    [source, setSource] = useState(""),
    [rows, setRows] = useState<ImportRow[] | null>(null),
    [error, setError] = useState(""),
    [reading, setReading] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const sourceColumn =
    file?.headers.findIndex((h) => /^account( name)?$/i.test(h.trim())) ?? -1;
  const sources =
    file && sourceColumn >= 0
      ? [...new Set(file.rows.map((r) => r[sourceColumn]))]
      : [];
  const selected = rows?.filter((r) => r.include) || [];
  function update(id: string, patch: Partial<ImportRow>) {
    setRows((rs) => rs!.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setConfirmed(false);
    setError("");
  }
  function chooseProfile(p: Profile) {
    setProfile(p);
    if (file) setMapping(guessMapping(file.headers, p));
    setRows(null);
  }
  function column(field: keyof Mapping, label: string) {
    if (!file || !mapping) return null;
    return (
      <label>
        {label}
        <select
          value={mapping[field]}
          onChange={(e) => {
            setMapping({ ...mapping, [field]: Number(e.target.value) });
            setRows(null);
          }}
        >
          <option value={-1}>Not used / choose column</option>
          {file.headers.map((h, i) => (
            <option key={i} value={i}>
              {h}
            </option>
          ))}
        </select>
      </label>
    );
  }
  let projected = "";
  if (rows && selected.length)
    try {
      const next = applyReviewedImport(rows, account, data);
      const a = data.accounts.find((a) => a.id === account)!;
      const delta =
        balance(a, next.transactions) - balance(a, data.transactions);
      projected = `Balance change: ${money(delta)}`;
    } catch {
      /* shown on explicit save */
    }
  return (
    <div className="import-flow">
      <p>
        Import posted CSV transactions from SoFi checking/savings, Discover, or
        Amex Blue Cash Everyday. Files are read in your browser; only reviewed
        transactions are saved. No bank passwords or connections.
      </p>
      {error && (
        <div role="alert" className="alert">
          {error}
        </div>
      )}
      {!rows ? (
        <>
          <label>
            Bank export format
            <select
              value={profile}
              onChange={(e) => chooseProfile(e.target.value as Profile)}
            >
              <option value="sofi">
                SoFi / SoFi Relay (positive = money in)
              </option>
              <option value="discover">Discover (positive = charges)</option>
              <option value="amex">
                Amex Blue Cash Everyday (positive = charges)
              </option>
              <option value="custom">Other CSV / custom mapping</option>
            </select>
          </label>
          <label>
            Transaction CSV file
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={reading || busy}
              onChange={async (e) => {
                const upload = e.target.files?.[0];
                setFile(null);
                setMapping(null);
                setError("");
                if (!upload) return;
                setReading(true);
                try {
                  if (upload.size > 2_000_000)
                    throw Error("Choose a CSV smaller than 2 MB.");
                  const csv = parseCSV(await upload.text());
                  setFile(csv);
                  setMapping(guessMapping(csv.headers, profile));
                  setSource("");
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Unable to read file.",
                  );
                } finally {
                  setReading(false);
                }
              }}
            />
          </label>
          {reading && <p role="status">Reading file…</p>}
          {file && mapping && (
            <>
              <div className="notice">
                {file.rows.length} rows read. Confirm the columns and amount
                direction before continuing.
              </div>
              {sources.length > 0 && (
                <label>
                  Source account in file
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    required
                  >
                    <option value="">Choose the account to import</option>
                    {sources.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Save into app account
                <select
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                >
                  {data.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="small">
                Import each account separately. Create the matching SoFi
                checking, SoFi savings, Discover, and Amex accounts on the
                Accounts page first. Use the balance just before your import
                date range as the opening balance, rather than today’s balance.
              </p>
              <div className="import-mapping">
                {column("date", "Date column")}
                {column("payee", "Description column")}
                {column("amount", "Signed amount column")}
                {column("debit", "Debit / money out column")}
                {column("credit", "Credit / money in column")}
                {column("direction", "Debit/credit type column (optional)")}
                <label>
                  Positive signed amounts mean
                  <select
                    value={mapping.positive}
                    onChange={(e) =>
                      setMapping({
                        ...mapping,
                        positive: e.target.value as Mapping["positive"],
                      })
                    }
                  >
                    <option value="inflow">
                      Money coming into this account
                    </option>
                    <option value="outflow">
                      Money leaving / card purchases
                    </option>
                  </select>
                </label>
                <label>
                  Slash date format
                  <select
                    value={mapping.dateOrder}
                    onChange={(e) =>
                      setMapping({
                        ...mapping,
                        dateOrder: e.target.value as Mapping["dateOrder"],
                      })
                    }
                  >
                    <option value="mdy">MM/DD/YYYY (US)</option>
                    <option value="dmy">DD/MM/YYYY</option>
                  </select>
                </label>
              </div>
              <p className="small">
                If you use separate debit/credit columns, set Signed amount
                column to “Not used.” Positive credits increase the account
                balance. Never import both a starting balance adjustment and the
                same opening balance.
              </p>
              <button
                className="primary"
                disabled={busy || (sources.length > 0 && !source)}
                onClick={() => {
                  try {
                    setError("");
                    const csv = sources.length
                      ? {
                          ...file,
                          rows: file.rows.filter(
                            (r) => r[sourceColumn] === source,
                          ),
                        }
                      : file;
                    setRows(previewRows(csv, mapping, account, data));
                    setConfirmed(false);
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "Unable to preview.",
                    );
                  }
                }}
              >
                <Upload size={17} />
                Preview transactions
              </button>
            </>
          )}
        </>
      ) : (
        <>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => {
              setRows(null);
              setError("");
            }}
          >
            <ArrowLeft size={16} />
            Back to mapping
          </button>
          <div className="import-summary">
            <strong>{data.accounts.find((a) => a.id === account)?.name}</strong>
            <span>
              {selected.length} of {rows.length} selected · {projected}
            </span>
          </div>
          <p className="small">
            Review every selected row. Card credits default to refunds, bank
            credits to income. Payments and transfers need the other account and
            are skipped by default. Import a transfer only once across all
            account files—even when posting dates differ. Duplicates are
            suggestions, not guaranteed matches.
          </p>
          <div className="import-rows">
            {rows.map((r) => (
              <article
                className={"import-row " + (!r.include ? "excluded" : "")}
                key={r.id}
              >
                <label className="import-include">
                  <input
                    type="checkbox"
                    checked={r.include}
                    disabled={
                      busy ||
                      !!r.error ||
                      (!!r.exactDuplicate && (!r.action || r.action === "new"))
                    }
                    onChange={(e) =>
                      update(r.id, { include: e.target.checked })
                    }
                  />
                  <span>Include row {r.line}</span>
                </label>
                <div className="import-description">
                  <strong>{r.payee || "Unreadable transaction"}</strong>
                  <span>
                    {r.date || "Invalid date"} ·{" "}
                    {r.incoming ? "Money in" : "Money out"} · {money(r.amount)}
                  </span>
                </div>
                {r.error ? (
                  <p className="warning">Skipped: {r.error}</p>
                ) : (
                  <>
                    <div className="import-matches">
                      <label>
                        Import action for row {r.line}
                        <select
                          disabled={busy}
                          value={r.action || "new"}
                          onChange={(e) =>
                            update(r.id, {
                              action: e.target.value as ImportRow["action"],
                              matchId: undefined,
                              billId: undefined,
                            })
                          }
                        >
                          <option value="new" disabled={r.exactDuplicate}>
                            Create a new transaction (review duplicates first)
                          </option>
                          {!!r.matches?.some(
                            (m) => m.kind === "transaction",
                          ) && (
                            <option value="existing">
                              Match existing transaction; do not create another
                            </option>
                          )}
                          {!!r.matches?.some((m) => m.kind === "loan") && (
                            <option value="loan">
                              Match existing loan payment; do not create another
                            </option>
                          )}
                          {!r.incoming && (
                            <option value="bill">
                              Create one payment and link a bill
                            </option>
                          )}
                        </select>
                      </label>
                      {(r.action === "existing" || r.action === "loan") && (
                        <label>
                          Existing match for row {r.line}
                          <select
                            value={r.matchId || ""}
                            onChange={(e) =>
                              update(r.id, { matchId: e.target.value })
                            }
                          >
                            <option value="">Choose a match to review</option>
                            {r.matches
                              ?.filter(
                                (m) =>
                                  m.kind ===
                                  (r.action === "loan"
                                    ? "loan"
                                    : "transaction"),
                              )
                              .map((m) => (
                                <option value={m.id} key={m.id}>
                                  {m.label}
                                </option>
                              ))}
                          </select>
                        </label>
                      )}
                      {r.matches?.length ? (
                        <details>
                          <summary>
                            Potential matches ({r.matches.length})
                          </summary>
                          {r.matches.map((m) => (
                            <p key={m.kind + m.id}>
                              {m.label}: {m.reason}
                            </p>
                          ))}
                        </details>
                      ) : null}
                      {(r.action === "bill" ||
                        r.action === "existing" ||
                        r.action === "loan") &&
                        !r.incoming && (
                          <label>
                            Link to bill for row {r.line}
                            <select
                              value={r.billId || ""}
                              onChange={(e) =>
                                update(r.id, { billId: e.target.value })
                              }
                            >
                              <option value="">
                                {r.action === "bill"
                                  ? "Choose a bill"
                                  : "No bill association"}
                              </option>
                              {data.bills
                                .filter((b) => b.account === account)
                                .map((b) => (
                                  <option value={b.id} key={b.id}>
                                    {b.date} · {b.name}
                                  </option>
                                ))}
                            </select>
                          </label>
                        )}
                      {(r.action || "new") === "new" &&
                        !r.incoming &&
                        data.accounts.some((a) => a.type === "debt") && (
                          <label>
                            Split as loan payment for row {r.line}
                            <select
                              value={r.loanId || ""}
                              onChange={(e) =>
                                update(r.id, { loanId: e.target.value })
                              }
                            >
                              <option value="">No loan split</option>
                              {data.accounts
                                .filter((a) => a.type === "debt")
                                .map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.name}
                                  </option>
                                ))}
                            </select>
                          </label>
                        )}
                      {(r.loanId ||
                        (r.action === "bill" &&
                          data.bills.find((b) => b.id === r.billId)
                            ?.loanAccount)) && (
                        <>
                          <label>
                            Principal for row {r.line} (USD)
                            <input
                              inputMode="decimal"
                              value={r.principal || ""}
                              onChange={(e) =>
                                update(r.id, { principal: e.target.value })
                              }
                            />
                          </label>
                          <label>
                            Interest for row {r.line} (USD)
                            <input
                              inputMode="decimal"
                              value={r.interest || ""}
                              onChange={(e) =>
                                update(r.id, { interest: e.target.value })
                              }
                            />
                          </label>
                        </>
                      )}
                    </div>
                    <div className="import-row-fields">
                      <label>
                        Type for row {r.line}
                        <select
                          disabled={busy}
                          value={r.type}
                          onChange={(e) =>
                            update(r.id, {
                              type: e.target.value as Transaction["type"],
                            })
                          }
                        >
                          {(r.incoming
                            ? ["income", "refund", "transfer"]
                            : ["expense", "transfer"]
                          ).map((t) => (
                            <option key={t}>{t}</option>
                          ))}
                        </select>
                      </label>
                      {r.type === "transfer" ? (
                        <label>
                          Other account for row {r.line}
                          <select
                            disabled={busy}
                            value={r.other}
                            onChange={(e) =>
                              update(r.id, { other: e.target.value })
                            }
                          >
                            <option value="">Choose other account</option>
                            {data.accounts
                              .filter((a) => a.id !== account)
                              .map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name}
                                </option>
                              ))}
                          </select>
                        </label>
                      ) : r.type === "expense" || r.type === "refund" ? (
                        <label>
                          Category for row {r.line}
                          <select
                            disabled={busy}
                            value={r.category}
                            onChange={(e) =>
                              update(r.id, { category: e.target.value })
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
                      ) : (
                        <p className="small">
                          {r.type === "income"
                            ? "Counts as income actually received."
                            : ""}
                        </p>
                      )}
                    </div>
                    {r.warning && (
                      <p className="warning">Review: {r.warning}</p>
                    )}
                  </>
                )}
              </article>
            ))}
          </div>
          <label className="import-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I reviewed the account, dates, signs, categories, duplicates, and
            transfers.
          </label>
          <button
            className="primary"
            disabled={!confirmed || !selected.length || busy}
            onClick={async () => {
              setError("");
              try {
                const next = applyReviewedImport(rows, account, data);
                if (!(await onSave(next)))
                  setError(
                    "Import was not saved. Check the error above and try again.",
                  );
              } catch (e) {
                setError(e instanceof Error ? e.message : "Import failed.");
              }
            }}
          >
            <Check size={17} />
            {busy ? "Saving…" : `Import ${selected.length} transactions`}
          </button>
        </>
      )}
    </div>
  );
}
