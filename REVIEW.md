# Budget improvements review

All changes belong to `feature/budget-improvements`. The production `main` branch and live financial records have not been changed by this work. See [IMPROVEMENTS.md](IMPROVEMENTS.md) for the supplied request.

## Audit: preserve working functionality

| Area                                                | Before this branch                                                                                | Change                                                                                                                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transfers, refunds, opening balances, card payments | Working integer-cent ledger; transfers update both accounts and are excluded from income/spending | Reuse existing ledger; add visible monthly net income and per-account cash flow                                                                             |
| Ordinary/imported transaction editing and deletion  | Working, with one legacy bill link cleared on deletion                                            | Reuse forms; extend bill recalculation, grouped loan editing/deletion, and recovery                                                                         |
| Bills                                               | Create, one-time/monthly recurrence, one payment with actual amount, one linked transaction       | Add edit/delete scopes, all requested recurrence frequencies, multiple/partial payments, linking, history, and explicit settlement/unpaid controls          |
| Loans                                               | Debt account balances and manual transfers; no structured loan-payment system                     | Add original amount/expected payment/rate metadata, derived principal, principal/interest split groups, existing-payment splitting, and history             |
| Rates and actual interest                           | Absent                                                                                            | Store annual rates in basis points; use APR for cards/debt and APY for savings/checking; label actual interest records                                      |
| CSV                                                 | Browser parsing, mapped accounts/signs, conservative same-day duplicate warnings, transfer review | Extend existing importer with stored row references, date/amount-tolerant suggestions, bill/loan links, and no duplicate cash movement for matched payments |
| Categories                                          | Custom flat categories with rename/archive and monthly limits                                     | Add one-level parents, move/edit/delete/reassign, parent filtering, spending rollups and budget envelopes                                                   |
| Savings goals / full reports                        | Goals placeholder; dashboard, monthly totals and category progress only                           | Goals deferred by the user. Existing summaries recalculate; no new standalone report/chart suite                                                            |

## User decisions

- Leave savings goals for later; this branch does not add goal allocation functionality.
- New bills become paid when linked actual payments reach the expected amount. A user may explicitly settle a lower/different final total.
- Previously paid legacy bills retain their explicit paid intent, including older lower-than-expected payments. No load-time rewrite is performed.

## Data model and safety

No Postgres schema migration is necessary or included. The existing per-user JSON document and authenticated, revision-checked RPC remain in use. All related changes are submitted in one household update; server errors/conflicts never show success.

Optional backward-compatible data additions:

- Accounts: annual `rateBps`, `originalPrincipal`, `expectedPayment`.
- Transactions: actual `interest` classification, loan part tags, and CSV `importKeys`.
- Bills: `paymentIds`, explicit `settledPaymentIds`, and optional tracked loan/card target. Old `paidTransaction` is read without loss.
- Categories: `parentId` (one level only; existing IDs remain unchanged).
- Household: grouped `loanPayments` and `deletedTransactions` recovery bundles.

Loan cash movement = principal transfer + interest expense. If the interest expense was already recorded against the loan, explicitly select that charge: its payment is a transfer, avoiding another expense. Remaining principal excludes accrued-interest charges and their settlement transfers. Unrelated existing charges are not deleted when a payment is removed. Deleting a charge associated with a payment deletes the linked group together; recovery restores valid associations.

Deleting a bill never deletes historical transactions. “This and future” edits affect the selected occurrence and generated future unpaid occurrences; prior paid occurrences and all transaction records stay intact. Turning recurrence to one-time removes only affected future unpaid occurrences. Recurrence dates clamp short months and preserve the scheduled day.

Removing any part of a loan payment removes the whole group. Recovery restores grouped parts and valid existing bill links. Recovery is blocked if necessary accounts/categories/interest charges are missing, or the same imported row is already active. Account deletion remains explicitly permanent and can make recovery impossible; use a backup before doing it in real data.

Parent budget limits are envelopes, not additions to child limits. A zero-default parent with no monthly override uses its children’s limits; an explicit parent limit, including zero, takes precedence. Parent spending includes direct and child assignments once. Category deletion requires reassignment when used by active or recoverable transactions/bills, preserves those records, removes the deleted limit, and promotes its children to roots.

CSV matching is conservative: up to five days for transactions/transfers/loans, seven days for bills, and an amount tolerance of 5% or $1 (whichever is larger). A nearby bill with overlapping description can also be suggested. Suggestions require review and never automatically overwrite amounts/dates or delete records. New row references persist across transaction/loan edits, including cross-account payment imports. Prior imports without references still rely on suggestions until reviewed. File exports with materially changed descriptions or date ranges may need manual review. For files without issuer transaction IDs, identical same-day/amount/description rows use occurrence order: overlapping exports containing only one of several truly identical purchases need manual comparison; a distinct purchase can still be recorded manually. No matcher can establish every real-world equivalence automatically.

## Review without touching your household

```sh
npm ci
npm test
npm run dev:review
```

Choose **Explore fictional demo**. The review build clearly disables cloud sign-in in both the interface and storage adapter and uses a different local-storage key. Production `.env.local` bindings are not used to create a Supabase client in review mode. Test with fictional files and records. Review changes persist only in this browser; reset them by clearing this review site's storage if needed.

To build a portable review artifact:

```sh
npm run build:review
npm run preview
```

The feature-branch review workflow produces a downloadable `budget-improvements-review` artifact containing `dist/` and fictional test screenshots. It never deploys to Pages. To open a downloaded artifact, unzip it and run `npx --yes serve dist` from the extracted folder (Node.js required); use the address printed by that local server. The production workflow is guarded against feature-branch dispatches.

## Manual verification checklist

1. **Transfers/net:** record $2,000 income, $2,300 expenses, and a $500 savings→checking transfer. Monthly net must be -$300; the transfer changes both account balances without changing net worth or category spending. Edit/delete it and verify both accounts.
2. **Bills:** record partial $30 and $35 payments for the demo $65 internet bill. It changes partial→paid and generates one next occurrence. Edit the future bill, then delete it; the original payment transactions remain.
3. **Payment recovery:** delete a linked payment under Transactions: bill status recalculates using remaining payments. Restore it in Recently deleted. Manually mark unpaid using “Keep transactions; unlink bill” and verify the original transactions remain.
4. **Loans/rates:** add a fictional $5,000 debt balance (opening -5000), original amount and expected payment, APR 6.25%. Record $250 principal + $50 interest. Principal becomes $4,750, cash falls $300, spending rises $50. Edit principal to $300, delete the payment, and restore it. Verify complete reversal and restoration. Extra principal is allowed up to the tracked principal.
5. **Actual interest:** edit savings APY to 4.25%. Record a savings income transaction classified as Actual interest earned. Rates themselves add no ledger entries. For previously charged loan interest, select the matching charge when paying.
6. **CSV:** pay an existing bill first, then import a fictional matching payment. Choose Match existing transaction and the bill link. Transaction count and cash movement must not increase. Re-import: the stored row is marked already imported and cannot create a new transaction. A new unpaid bill payment may instead be created and linked once. Loan imports require a split totaling the full CSV amount.
7. **Categories:** create Food and move Groceries under it. Create a new child, record an expense, verify parent rollup, move the child, and delete/reassign it. Parent filtering includes child transactions without duplication.
8. **Failure/mobile:** cancel deletion dialogs; simulate a save failure and confirm no successful state. Check layout, controls, and relevant totals on phone and desktop.

## Validation evidence and limits

**Local verification passed:** 52 unit/database tests, 30 desktop/mobile browser tests (1440 px and 390 px), and the review production build. Screenshots of the loan and subcategory interfaces were inspected. Automated tests use fictional fixtures and a local Postgres-compatible database for the actual SQL. They do not establish that these new flows have been exercised against a separate hosted development Supabase project.

No live financial records were loaded, modified, deleted, or migrated during this work. No production backup has been claimed. Before a future approved merge and real-data trial, export the complete current household JSON in Settings, keep it private, and close old app tabs. Replacement backup restore remains outside this branch; transaction recovery is not a full backup system. APR/APY are editable reference rates; no amortization estimates or automatic interest posting are introduced.

## File map

- Core types, validation and existing ledger: `src/ledger.ts`. New financial operations, recurrence, linking, category rollups and recovery: `src/planning.ts`. Extended account-deletion cleanup: `src/accountDeletion.ts`.
- New controls preserving existing styling: `src/BillsPanel.tsx`, `src/BudgetPanel.tsx`, `src/LoanPaymentEditor.tsx`, `src/AccountInsights.tsx`; integration and interest/rate fields: `src/main.tsx`, `src/style.css`.
- Existing importer extended: `src/importer.ts`, `src/ImportDialog.tsx`; matching suggestions and stable row references: `src/importMatching.ts`.
- Review isolation and tooling: `src/storage.ts`, `package.json`, `playwright.config.ts`, `.github/workflows/review.yml`, and the feature-ref guard in `.github/workflows/deploy-pages.yml`.
- Tests: `src/planning.test.ts`, `src/database.test.ts`, `src/importer.test.ts`, `tests/app.spec.ts`, `tests/improvements.spec.ts`. Existing financial regression suites remain in use.
- Requirements, conventions and review instructions: `IMPROVEMENTS.md`, `AGENTS.md`, `README.md`, `REVIEW.md`.
- `supabase/schema.sql`, dependencies/lockfile, credentials and production financial data were not changed.
