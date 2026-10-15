import { useState } from "react";
import { type Data, cents, uid, money, validate } from "./ledger";
import {
  categorySpending,
  categoryLimit,
  deleteCategory,
  totalBudget,
} from "./planning";
export function BudgetPanel({
  data,
  month,
  busy,
  onSave,
}: {
  data: Data;
  month: string;
  busy: boolean;
  onSave: (d: Data) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState<string | null>(null),
    [deleting, setDeleting] = useState<string | null>(null),
    [error, setError] = useState("");
  const c = data.categories.find((c) => c.id === editing);
  async function store(next: Data) {
    try {
      validate(next);
      const ok = await onSave(next);
      if (ok) {
        setEditing(null);
        setDeleting(null);
        setError("");
      }
      return ok;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save category.");
      return false;
    }
  }
  const ordered = data.categories
    .filter((c) => !c.parentId)
    .flatMap((c) => [c, ...data.categories.filter((x) => x.parentId === c.id)]);
  return (
    <section className="panel">
      <div className="panel-title">
        <div>
          <h2>Monthly category limits</h2>
          <p>
            Parent spending includes its subcategories once. Parent limits are
            not added again to child limits. Total plan:{" "}
            {money(totalBudget(data, month))}.
          </p>
        </div>
        <button disabled={busy} onClick={() => setEditing("new")}>
          Add category
        </button>
      </div>
      {error && (
        <div role="alert" className="alert">
          {error}
        </div>
      )}
      <button
        disabled={busy}
        onClick={() => {
          const [y, m] = month.split("-").map(Number),
            prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
          void store({
            ...data,
            budgets: {
              ...data.budgets,
              [month]:
                data.budgets[prev] ||
                Object.fromEntries(
                  data.categories.map((c) => [
                    c.id,
                    categoryLimit(data, prev, c.id),
                  ]),
                ),
            },
          });
        }}
      >
        Copy previous month
      </button>
      {editing && (
        <form
          className="inline-editor"
          key={editing}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget),
              name = String(f.get("name")).trim(),
              parentId = String(f.get("parent")) || undefined;
            void store({
              ...data,
              categories: c
                ? data.categories.map((x) =>
                    x.id === c.id ? { ...x, name, parentId } : x,
                  )
                : [...data.categories, { id: uid(), name, parentId, limit: 0 }],
            });
          }}
        >
          <h3>{c ? "Edit category" : "Add category"}</h3>
          <label>
            Category name
            <input
              name="name"
              defaultValue={c?.name}
              maxLength={120}
              required
            />
          </label>
          <label>
            Parent category
            <select name="parent" defaultValue={c?.parentId || ""}>
              <option value="">Top-level category</option>
              {data.categories
                .filter(
                  (x) =>
                    !x.parentId &&
                    x.id !== c?.id &&
                    (!c || !data.categories.some((y) => y.parentId === c.id)),
                )
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </select>
          </label>
          <p className="small">
            A category with subcategories must stay at the top level. Move its
            children first if needed.
          </p>
          <div className="delete-actions">
            <button type="button" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="primary" disabled={busy}>
              Save category
            </button>
          </div>
        </form>
      )}
      {ordered.map((c) => (
        <article
          className={"budget-edit " + (c.parentId ? "subcategory" : "")}
          key={c.id}
        >
          <strong>
            {c.parentId ? "↳ " : ""}
            {c.name}
            {c.archived ? " (archived)" : ""}
          </strong>
          <span>Spent {money(categorySpending(data, month, c.id))}</span>
          <span
            className={
              categorySpending(data, month, c.id) >
              categoryLimit(data, month, c.id)
                ? "warning"
                : ""
            }
          >
            Remaining{" "}
            {money(
              categoryLimit(data, month, c.id) -
                categorySpending(data, month, c.id),
            )}
            {categorySpending(data, month, c.id) >
            categoryLimit(data, month, c.id)
              ? " · Over budget"
              : ""}
          </span>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              try {
                const raw = String(new FormData(e.currentTarget).get("limit"));
                const limits = { ...data.budgets[month] };
                if (raw.trim() === "") delete limits[c.id];
                else {
                  const value = cents(raw);
                  if (value < 0) throw Error("Limit cannot be negative.");
                  limits[c.id] = value;
                }
                void store({
                  ...data,
                  budgets: { ...data.budgets, [month]: limits },
                });
              } catch (e) {
                setError(e instanceof Error ? e.message : "Invalid limit");
              }
            }}
          >
            <label className="sr-only" htmlFor={c.id}>
              Limit for {c.name}
            </label>
            <input
              name="limit"
              id={c.id}
              key={month + categoryLimit(data, month, c.id)}
              defaultValue={(categoryLimit(data, month, c.id) / 100).toFixed(2)}
              inputMode="decimal"
            />
            <button disabled={busy}>Save limit</button>
          </form>
          <button disabled={busy} onClick={() => setEditing(c.id)}>
            Edit category
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void store({
                ...data,
                categories: data.categories.map((x) =>
                  x.id === c.id ? { ...x, archived: !x.archived } : x,
                ),
              })
            }
          >
            {c.archived ? "Unarchive" : "Archive"}
          </button>
          <button disabled={busy} onClick={() => setDeleting(c.id)}>
            Delete category
          </button>
          {deleting === c.id && (
            <form
              className="inline-editor full-width"
              onSubmit={(e) => {
                e.preventDefault();
                try {
                  const id = String(
                    new FormData(e.currentTarget).get("reassign"),
                  );
                  if (
                    confirm(
                      `Delete category ${c.name}? Transactions will be reassigned, not deleted. Its children will become top-level categories and its budget limit will be removed.`,
                    )
                  )
                    void store(deleteCategory(data, c.id, id || undefined));
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Cannot delete category",
                  );
                }
              }}
            >
              <p>
                Reassign any transactions and bills to another category.
                Subcategories become top-level; transaction history is
                preserved.
              </p>
              <label>
                Reassign to
                <select name="reassign">
                  <option value="">No reassignment (only if unused)</option>
                  {data.categories
                    .filter((x) => x.id !== c.id)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                </select>
              </label>
              <button disabled={busy}>Confirm category deletion</button>
              <button type="button" onClick={() => setDeleting(null)}>
                Cancel
              </button>
            </form>
          )}
        </article>
      ))}
      <p className="small">
        Clear a monthly limit to use its default. A parent with a zero default
        and no monthly override uses the sum of its children’s limits; an
        explicit parent limit is the total envelope, not an extra allocation.
      </p>
    </section>
  );
}
