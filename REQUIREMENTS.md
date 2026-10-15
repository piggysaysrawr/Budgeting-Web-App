Project scope

- One household with one user account.
- Manual entry of financial information. No bank connections.
- Choose an appropriate, maintainable tech stack.
- Prefer online hosting and a database with a free tier. Verify current free-tier limits before choosing services and explain any setup I need to complete.
- Do not enable paid services without asking.
- Use persistent storage. Financial data must survive refreshes and sign-outs and sync across devices.
- Protect all financial data behind authentication.
  Budgeting approach
- Use monthly spending limits for customizable categories.
- Provide starter categories such as housing, utilities, groceries, dining out, transportation, insurance, entertainment, and miscellaneous.
- Let me create, rename, archive, and reorder categories.
- Show budgeted, spent, and remaining amounts for each category.
- Clearly highlight categories that are over budget.
- Allow copying a previous month’s budget.
- Keep planned income separate from income actually received.
- Keep remaining category budget separate from actual account balances.
  Accounts and transactions
- Track checking, savings, cash, credit cards, and other debts.
- Support account names, opening balances, and opening balance dates.
- Support income, expenses, transfers, and refunds.
- Each transaction should include a date, amount, account, category where applicable, payee or income source, and optional notes.
- Allow editing and deleting transactions with confirmation for deletion.
- Provide search and filters by date, category, account, and transaction type.
- Transfers between accounts must not count as income or spending.
- Credit card purchases count as spending. Credit card payments are transfers and must not count as spending again.
- Refunds reduce spending in the appropriate category.
- Opening balances must not count as income.
- Clearly distinguish assets, money owed, and net worth.
- For debt payments, distinguish principal from interest and fees so balances and spending remain accurate.
  Income from multiple jobs
- Support multiple jobs and other income sources.
- Track take-home pay actually received.
- Support expected weekly, every-two-weeks, twice-monthly, monthly, and irregular paychecks.
- Allow different expected paycheck amounts and schedules for each job.
- Allow individual expected paychecks to be adjusted without changing the whole schedule.
- Show income totals by source and month.
- Clearly label expected income as an estimate.
  Bills and due dates
- Track bills with a name, expected amount, due date, category, payment account, and optional notes.
- Support one-time bills and recurring weekly, every-two-weeks, monthly, quarterly, and yearly bills.
- Support variable bill amounts and subscriptions.
- Show upcoming bills in a calendar and a chronological list.
- Show dashboard alerts for bills due soon, due today, and overdue.
- Let me configure how many days ahead a bill appears in the “due soon” list.
- Show the total unpaid bills due before my next expected paycheck.
- Track paid and unpaid status separately for each bill occurrence.
- Marking a bill paid should let me create a payment transaction or link an existing one, preventing duplicate spending.
- Record the actual payment date and amount.
- Autopay is a label, not proof that a bill has been paid.
- Editing recurring bills should offer “this occurrence” or “this and future occurrences.”
- Handle short months correctly, such as a bill scheduled for the 31st falling on the last day of February.
- First-version reminders are inside the app. Clearly explain that they do not notify me when the app is closed.
  Savings goals
- Support goals with a name, target amount, optional target date, and allocated savings.
- Show progress and the monthly amount needed to reach a dated goal.
- Treat savings contributions between my accounts as transfers, not expenses.
- Goal allocations must not create extra money or count the same savings toward multiple goals.
  Dashboard and reports
  The dashboard should show:
- Account balances and total credit card/debt balances.
- Actual income and spending for the selected month.
- Remaining category budgets.
- Upcoming and overdue bills.
- Expected next paychecks.
- Savings goal progress.
- A simple projected cash-flow view for the next 30 days.
  Cash-flow projections should start from current selected cash-account balances and include unpaid scheduled bills and expected paychecks. Avoid counting paid bills or received paychecks twice. Label the projection as an estimate that excludes unplanned spending.
  Include reports for spending by category, monthly income versus expenses, and income by job. Charts should have readable labels and useful empty states.
  Design
- Use a clean, modern dashboard with readable typography and restrained colors.
- Support light and dark modes.
- Make adding an expense quick on a phone.
- Use clear navigation for Dashboard, Transactions, Budget, Bills, Accounts, Savings, and Settings.
- Do not rely only on color to communicate warnings.
- Use accessible labels, keyboard navigation, and mobile-friendly touch targets.
- Keep sample data optional and separate from my real data.
  Data reliability and security
- Use USD initially.
- Store money as integer cents or an exact decimal type to avoid rounding errors.
- Handle transaction dates and bill due dates consistently in my chosen timezone.
- Validate inputs and explain errors clearly.
- Never show a save as successful unless the data was actually saved.
- Keep credentials and secrets out of client-side code and source control.
- Enforce authorization on the backend or database.
- Allow CSV export of transactions.
- Provide a complete backup and restore option for accounts, transactions, budgets, bills, and goals.
- Restoring a backup must validate its contents and warn before replacing existing data.
  Acceptance criteria
- I can sign in on my phone and computer and see the same saved data.
- I can track paychecks from multiple jobs independently.
- A $50 grocery purchase reduces the account balance and grocery budget remaining by $50.
- A credit card purchase counts as an expense once. Paying the card changes balances without adding another expense.
- A transfer from checking to savings changes both balances without changing income or spending.
- Paying a recurring bill marks only that occurrence paid and records or links exactly one transaction.
- Overdue unpaid bills remain visible until resolved.
- Editing or deleting a transaction correctly updates balances, budgets, and reports.
- Expected paychecks do not increase actual balances until recorded as received.
- Data remains available after refresh and sign-out.
- Core calculations and recurring-date behavior have automated tests.
  Implementation instructions
  First inspect the existing project, if any. Explain the proposed architecture and implementation phases briefly, then build the app. Make reasonable decisions for routine details. Ask me only about choices that materially affect cost, privacy, or scope.
  Complete and verify the core budgeting, transaction, and bill workflows before adding optional features. Include setup instructions and clearly identify anything that still requires my action. Do not claim deployment or notifications work unless they have been configured and verified.

## Added requirement: transaction-file imports

- Support CSV transaction imports for SoFi checking/savings, Discover, and Amex Blue Cash Everyday, retaining manual entry.
- Support multi-account SoFi Relay exports by selecting one source account and mapping it to an app account per import.
- Parse locally, preview before saving, allow category/type review, and flag potential duplicates and transfers. Never book card payments as expenses automatically.
- Use integer cents, reject invalid/pending/before-opening transactions, and preserve atomic authenticated storage.
- Keep original financial files and personal samples out of the public repository. Use fictional regression fixtures.
- CSV presets must expose sign and column mapping because issuer export formats can change. PDF/OFX/QFX support is outside this change.

## Added requirement: account deletion

- Allow deleting accounts after explicit typed confirmation. Explain removal of linked transactions/bills and effects on other balances before saving.
- Remove all account references atomically, including transfers in either direction. Reopen retained bills when their linked payment is removed.
- Recalculate balances and totals; cancel and storage failures must preserve all data. Never delete an actual bank account or the household login.
