# Budgeting Web App Improvements

I want to make several improvements to my existing budgeting web app. Before implementing anything, review the existing codebase and determine which features are already implemented and which need to be added or fixed.

**Do not rebuild functionality that already works correctly.** Make only the changes necessary while preserving the existing design, functionality, and user data.

## 1. Git Branch and Data Protection

Before making changes:

- Create a new Git branch named `feature/budget-improvements` from the current working version.
- Check for uncommitted changes before creating the branch. Do not overwrite or discard existing work.
- Do not automatically commit unrelated changes.
- Do not modify or merge into `main` without my approval.
- Preserve the existing UI and overall application architecture unless changes are necessary.
- Avoid unnecessary database schema changes.
- If database migrations are needed, make them safely and explain what changed.
- Use a development database or create a verified backup before making potentially destructive changes to existing financial data.

I want the ability to review and test all improvements before merging them into the main branch.

## 2. Transfers and Monthly Budget Calculations

Review how transfers are currently implemented.

Transfers between accounts I own should update account balances correctly without counting as income or expenses.

**Expected behavior:**

- Transferring money between accounts should decrease the source account balance and increase the destination account balance.
- Transfers should not count toward earned income or spending totals.
- Transfers should not affect spending category budgets.
- Monthly net income should equal actual income minus actual expenses.
- If I spend more than I earn during a month, the app should show a negative monthly net amount, even if I transferred money from savings to cover the difference.
- Transfers should still affect individual account balances.
- Transfers should not change total net worth when both accounts are tracked.
- Credit card payments between tracked accounts should be treated as transfers to avoid counting the same purchase twice.
- Transfers into savings accounts should still be able to contribute toward savings goals.
- Transfers should appear in transaction history with the source account, destination account, amount, and date.
- Editing or deleting a transfer should update both accounts correctly.

**Example:**

- Monthly income: $2,000
- Transfer from savings to checking: $500
- Monthly expenses: $2,300
- Monthly net income: -$300

Even though the transfer increases the checking balance, I still spent $300 more than I earned.

Make sure the app clearly distinguishes between income, expenses, monthly net income, account cash flow, account balances, and net worth.

## 3. Edit and Delete Bills

Make sure existing bills can be edited and deleted.

I should be able to:

- Change a bill's name.
- Change its expected payment amount.
- Change its due date.
- Change its recurrence schedule.
- Change its associated account.
- Change its category or subcategory.
- Delete bills that are no longer needed.
- Edit recurring bills without unintentionally modifying previous payment records.

Deleting a bill should not automatically delete historical financial transactions associated with it.

If a recurring bill has previous payments, preserve those records.

If the application already supports some of these capabilities, only implement what is missing.

## 4. Actual Payment Amounts for Bills and Loans

I want to record the actual amount paid toward bills and loans rather than relying only on the expected payment amount.

**Example:**

- Expected car payment: $250
- Actual payment: $300

The app should record the actual $300 payment and correctly update the associated account balance, payment history, and cash-flow reporting.

For bills:

- Store the expected amount separately from the actual amount paid.
- Allow payments that are higher or lower than the expected amount.
- Support partial payments when appropriate.
- Update payment status based on actual recorded payments.

For loans:

- Track the original loan amount.
- Track the remaining principal balance.
- Store the expected monthly payment.
- Allow actual payment amounts to differ from the expected amount.
- Support extra principal payments.
- Track principal and interest separately.
- Update remaining principal after each payment.
- Preserve complete loan payment history.
- Allow loan details and payment information to be edited when necessary.

Loan principal payments should reduce liabilities rather than being classified as expenses. Interest charges should be classified as expenses.

However, the full payment should still be reflected in account cash flow so I can see how much money actually left my checking or savings account.

Make sure loan payments are not counted twice if they are linked to an existing transaction.

## 5. Interest Rates

Review existing account, credit card, and loan functionality and add interest rate support where appropriate.

I want to:

- Store annual interest rates for loans.
- Store APR for credit cards.
- Store APY for interest-bearing savings accounts.
- Edit interest rates when they change.
- View interest rates in account and loan details.
- Track actual interest charged on loans and credit cards.
- Track interest earned on savings accounts.
- See interest paid separately from principal payments.

If helpful, add estimated interest calculations for loans, but clearly distinguish estimates from actual recorded transactions.

Do not automatically add estimated interest charges to transaction history.

Use the correct APR or APY terminology depending on the account type.

## 6. Prevent Duplicate Transactions and Bills During CSV Imports

Review how CSV transaction imports currently work, especially when imported transactions correspond to existing bills, loan payments, transfers, or manually entered transactions.

I do not want imported transactions to create duplicate expenses or payments.

**Example:**

I have an $80 internet bill already recorded in my app.

When I import a bank CSV containing that $80 payment, the app should identify that it may correspond to the existing bill.

It should not create another copy of the same expense or bill.

Requirements:

- Detect exact duplicate transactions.
- Check whether an imported transaction matches an existing manually entered transaction.
- Check whether an imported transaction corresponds to an existing bill payment.
- Check whether an imported transaction corresponds to a loan payment.
- Check whether an imported transaction represents one side of an existing transfer.
- Use information such as date, amount, description, and account to identify matches.
- Allow reasonable differences in dates and amounts.
- Show potential matches when confidence is uncertain.
- Let me review uncertain matches before importing.
- Prevent the same CSV transactions from being imported multiple times.
- Do not automatically delete or overwrite existing transactions to resolve uncertain matches.
- Ensure matched transactions are linked to the correct bill, loan, or transfer.

If an imported transaction is linked to a bill payment, update the bill's payment status correctly.

If the application already has duplicate detection, improve the existing system rather than replacing it unnecessarily.

## 7. Categories and Subcategories

I want to organize my spending using categories and subcategories.

For example:

**Food**
- Groceries
- Restaurants
- Fast Food

**Transportation**
- Gas
- Car Maintenance
- Insurance

**Entertainment**
- Video Games
- Subscriptions
- Movies

Requirements:

- Allow me to create custom categories.
- Allow me to edit and delete categories.
- Allow me to create subcategories under an existing parent category.
- Allow me to edit, delete, and move subcategories between parent categories.
- Allow transactions to be assigned to a category or subcategory.
- Allow me to filter transactions by category or subcategory.
- Show total spending for parent categories.
- Show separate spending totals for each subcategory.
- Allow budget limits for parent categories and individual subcategories.
- Prevent double counting when calculating parent-category totals or budgets.
- Preserve existing transaction categories during migration.

For now, one level of subcategories is sufficient unless the current architecture already supports additional levels.

When deleting a category that contains transactions, ask whether those transactions should be reassigned rather than automatically deleting them.

## 8. Delete and Edit Transactions

Make sure I can edit and delete transactions, including manually entered and CSV-imported transactions.

Requirements:

- Allow transactions to be edited.
- Allow transactions to be deleted.
- Ask for confirmation before deleting a transaction.
- Update the associated account balance when a transaction is edited or deleted.
- Recalculate monthly income and expenses.
- Update category spending totals.
- Update budget progress.
- Update charts and financial reports.
- Correctly handle transactions linked to bills, loans, savings goals, or transfers.
- Prevent orphaned records or inconsistent balances.

If a transaction is part of a transfer between two accounts, editing or deleting it should update both sides of the transfer together.

**Transaction recovery:**

If practical, implement soft deletion or an Undo Delete feature so accidentally deleted transactions can be restored.

Restoring a transaction should also restore its financial effects and valid associations without duplicating records.

## 9. Revert Paid Bills When Transactions Are Deleted

This is especially important.

If a transaction was used to mark a bill as paid, deleting that transaction should automatically update the bill's payment status.

**Example:**

1. I have an $80 internet bill.
2. A transaction for $80 is linked to that bill.
3. The app marks the bill as paid.
4. I delete the $80 transaction.
5. The bill should automatically change back to unpaid.

Requirements:

- Track which transactions are associated with each bill payment.
- Deleting a linked transaction should recalculate the bill's payment status.
- If there are no remaining valid payments, change the bill to unpaid.
- If the bill has only been partially paid, show the appropriate partial payment status.
- If multiple transactions contribute toward a bill, calculate the total using the remaining valid transactions.
- Do not delete the recurring bill itself when deleting a payment.
- Preserve historical bill information.
- Do not leave a bill incorrectly marked as paid after its payment transaction is removed.
- If an imported transaction was matched to a bill, deleting it should also remove that association.
- Restoring a deleted payment should restore the bill's correct payment status.

**Manual payment status changes:**

I should also be able to manually mark a bill as unpaid if it was accidentally marked as paid.

If the bill has a linked payment transaction, do not silently delete or change that transaction. Ask how I want to handle the linked payment.

## 10. Loan Payment Deletion and Recalculation

If a transaction associated with a loan payment is edited or deleted, make sure the loan balance and payment history are updated correctly.

For example:

1. I have a loan balance of $5,000.
2. I record a $300 payment, including $250 toward principal and $50 toward interest.
3. The loan principal decreases to $4,750.
4. I delete the payment transaction.
5. The loan principal should return to $5,000, assuming no other changes occurred.

Requirements:

- Reverse principal reductions when payments are deleted.
- Reverse associated interest records when appropriate.
- Recalculate remaining balances after payment edits or deletions.
- Preserve the correct ordering of historical payments.
- Correctly handle partial payments and extra principal payments.
- Avoid double counting payments and interest.
- Keep loan balances and account balances synchronized with transaction records.

Use the existing loan calculation system where possible.

## 11. Financial Data Consistency

Review how financial records are connected throughout the application.

I want changes to transactions, bills, loans, transfers, and accounts to remain consistent.

Make sure:

- Account balances update correctly.
- Income and expense reports update correctly.
- Credit card balances update correctly.
- Loan balances update correctly.
- Bill statuses update correctly.
- Savings goals update correctly.
- Category totals update correctly.
- Monthly summaries update correctly.
- Imported and manually entered transactions follow the same financial rules.

Where appropriate, use database transactions or equivalent safeguards so that related updates either all succeed or all fail.

Avoid financial data inconsistencies caused by partially completed operations.

## 12. Testing and Quality Assurance

After reviewing and implementing the necessary changes, test all affected functionality.

At minimum, test:

- Transfers between checking and savings accounts.
- Transfers to and from credit cards.
- Monthly spending exceeding income.
- Editing and deleting transfers.
- Editing and deleting recurring bills.
- Recording bills with different expected and actual payment amounts.
- Partial bill payments.
- Loan payments with principal and interest.
- Extra loan payments.
- Editing and deleting loan payments.
- Interest rate storage and calculations.
- Reimporting the same CSV file.
- Matching imported transactions to existing bills.
- Preventing duplicate transactions.
- Creating, editing, and deleting subcategories.
- Editing and deleting ordinary transactions.
- Reverting paid bills when linked transactions are deleted.
- Restoring accidentally deleted transactions, if recovery is supported.
- Ensuring account balances and monthly reports remain correct after edits and deletions.

Add or update automated tests wherever practical.

Prioritize financial correctness, preventing duplicate records, and preserving user data.

## 13. Final Summary and Review

When finished, provide a clear summary of:

1. What functionality already existed and was working correctly.
2. What functionality was missing or incorrect.
3. What changes were implemented.
4. Which files were modified.
5. Any database schema changes or migrations.
6. What testing was performed and whether the tests passed.
7. Any remaining issues, limitations, or recommended improvements.
8. How I can manually test the new functionality.

Do not claim a feature is tested unless the relevant test was actually performed.

**Final instructions:**

- Do not make unnecessary changes.
- Follow the application's existing architecture and coding conventions.
- Preserve the current visual design unless UI changes are necessary for the requested features.
- Do not delete existing financial data.
- Do not introduce duplicate transactions or inconsistent account balances.
- Do not merge into `main`.
- Keep all changes on `feature/budget-improvements` until I review and approve them.