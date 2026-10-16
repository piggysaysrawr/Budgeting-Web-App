# Debts tab

This change is on `feature/debts-tab`, based on merged main `c7da61b`. It is separate from the earlier budgeting improvements and does not change live financial records.

## Behavior

- Debts shows existing loan/debt accounts by default. Remaining balances come from the same opening balances and transactions used by Accounts; there is no second liability record to drift or double-count.
- Credit cards are individually optional, matching the user's preference to pay them off monthly but include them when useful. Select **Credit cards (optional) → Show [card] in Debts**. Hiding a card here keeps its account, transactions, and net-worth effects intact. A new card added through Debts is included automatically.
- Each debt shows its recorded remaining balance, next unpaid payment, APR, and relevant account details. Loans also show remaining principal and grouped principal/interest payment history. Card overpayments show an account credit rather than negative debt.
- **Add debt** reuses the existing account form, defaulting to debt and permitting loans or cards. Enter money owed as a negative opening balance and use the correct opening date. **Edit debt details** edits that same account.
- **Add debt payment schedule** reuses the bill occurrence model and existing payment/linking controls. Expected and actual amounts stay separate. Payment schedules can be edited/deleted with the existing occurrence scopes; transactions are retained on bill deletion.
- Loan payments reuse the existing principal/interest form. **Record card payment** preselects a transfer from a cash account to that card, so the purchase is not expensed again.
- The overview totals remaining debt shown here and the unpaid amount of each debt's next scheduled occurrence. It does not add expected payments to balances or assume they have happened.
- Tracked debt schedules appear under Debts, while ordinary bills remain under Bills. Optional cards not shown in Debts retain their schedules in Bills. Dashboard upcoming/overdue reminders include all schedules.
- Existing ordinary bills are not guessed to be debts based on their names/categories. To associate one with a debt, use Bills → Edit bill → Tracked loan or credit card payment. That changes its association; it does not rewrite historical transactions or apply past payments to principal again.

The user explicitly chose optional credit cards. The initial implementation uses separate debt schedules and recorded balances/payment history; payoff forecasts and extra-payment comparisons are outside this change. No automatic interest or estimated payments are posted.

## Persistence and compatibility

One optional household field, `debtPreferences.creditAccountIds`, stores the cards selected for this view. It uses the existing atomic, authenticated save. Existing households without that field show loans by default. Account deletion removes its preference entry; changing a tracked card's account type also cleans up the preference. Failures preserve previous settings and never show success.

No Supabase schema change, data migration, new service, or dependency is required. Existing accounts, bills, transactions, loan groups and categories are preserved. Tests and screenshots use fictional data in review mode, which disables cloud access.

## Test manually

1. Run `npm ci`, then `npm run dev:review`, and choose the fictional demo. Open Debts; the demo credit card is excluded initially.
2. Include the demo credit card. Record a $40 card payment. Its $290 balance becomes $250 and monthly spending remains $120.50. Refresh and verify the card selection and payment persist. Hide the card: it remains in Accounts.
3. Add a fictional loan with opening balance -5000 and APR 6.25%. Add a monthly $300 payment schedule. It appears under Debts and stays out of ordinary Bills; dashboard alerts retain it.
4. Pay $250 principal and $50 interest. Remaining balance/principal becomes $4,750; checking decreases $300; spending increases only $50. Verify the same balance under Accounts.
5. Edit an existing bill to associate it with the loan. Verify it appears in Debts without creating another schedule or changing balances merely from the association.
6. Add a card schedule, then hide that optional card. Its schedule remains accessible under Bills. Check payment-schedule account filters and phone layout.

## Files

- `src/debts.ts`: tracked-account selection and derived balance/due-date summaries.
- `src/DebtsPanel.tsx`: view, optional cards, debt cards, and shared schedule panel.
- `src/BillsPanel.tsx`: scoped views and debt schedule defaults/validation; existing payment operations reused.
- `src/main.tsx`, `src/style.css`: navigation, transfer prefill, debt-form defaults and responsive styling.
- `src/ledger.ts`, `src/accountDeletion.ts`: optional preference validation and cleanup.
- `src/debts.test.ts`, `src/database.test.ts`, `tests/debts.spec.ts`, `tests/app.spec.ts`: model/database and desktop/mobile verification.
- `.github/workflows/review.yml`: run safe review checks for this feature branch.

The production Pages deployment is unchanged and restricted to main. This branch is for review before merging; it has not been deployed to the live app.

## Verification

- 58 unit/database tests passed, including persistence of card preferences through the unchanged SQL/RLS save function.
- 40 browser checks passed across 1440px desktop and 390px mobile, including all existing budgeting regressions.
- Production and cloud-disabled review builds passed. Mobile loan and desktop card screenshots were inspected.
- Checks used fictional demo/local database data. Hosted production financial data was not read or modified.
