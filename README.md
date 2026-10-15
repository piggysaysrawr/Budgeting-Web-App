# Hearth · Household budget

**Feature-branch review:** see [REVIEW.md](REVIEW.md) for the budgeting improvements, safe fictional review mode, and manual checks. These changes are not merged or deployed to the live app.

A working first-stage household ledger: accounts, manual income/expenses/transfers/refunds, monthly budgets, and basic bills. Read the original scope in [REQUIREMENTS.md](REQUIREMENTS.md). This release is a foundation, not completion of the full specification.

## Run locally

Requires Node 22+ (tested with 24.19) and npm.

```sh
cd /workspace/Budgeting-Web-App
npm ci --cache /workspace/.npm-cache
npm run dev
```

Choose **Explore fictional demo** to try the app without credentials. Demo data is explicitly fictional, stays in this browser's local storage, survives refresh/sign-out, and is never uploaded. Real financial data should use authenticated cloud storage. The normal sign-in screen does not reveal financial records.

## Connect your existing Supabase project

1. In Supabase's SQL Editor, run [supabase/schema.sql](supabase/schema.sql). This creates the private household table and atomic save function. It does not seed any financial records.
2. In Authentication → Users, create/invite your household's one user. Use a strong password. Disable public signups in Authentication settings if this project is only for your household. The app intentionally has no public registration screen.
3. Create **`.env.local` in this repository's top directory**, next to `package.json`. It is ignored by Git. A local file has been prepared with your project URL. Add the **publishable** (or legacy anon) key from Supabase Settings → API Keys:

   ```dotenv
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
   ```

   These are public browser configuration, not administrator credentials. Never use a service-role or secret key. Backend row-level security is mandatory.

4. Restart `npm run dev` after changing environment configuration. Sign in with the household user. Add a small test account and transaction; refresh and sign out/in, then check from a second browser/device. Do not claim sync is configured until this passes.
5. For cloud-hosted builds, set these same two Vite variables in the hosting build settings, then rebuild. An `.env.local` file does not automatically configure the host.

Supabase connectivity was verified after the schema was installed: the Auth settings endpoint responds successfully, and anonymous reads of the household table are denied as expected. Authenticated save/load and cross-device persistence still need a signed-in test. No password or service-role key is needed in chat.

## Delete an account

On **Accounts**, choose **Delete account**. The confirmation lists how many linked transactions and bill occurrences will be permanently removed and identifies other accounts affected by removed transfers. Type the exact account name and acknowledge the warning before deleting. There is no undo; use Settings → Download full JSON before deleting if you need an archive (automatic restore is not implemented).

The deletion is one atomic household save. Removing a transfer removes both sides, so the remaining account's balance changes; income/spending totals and net worth also recalculate. Bills on other accounts whose payment transactions are removed become unpaid. Your bank account and Supabase login are unaffected. Cancel preserves all data, and a failed save keeps the account and confirmation open.

## Import transactions from bank CSV files

Choose **Import CSV** beside Add transaction. No new database migration or bank connection is required. Files are parsed locally; only transactions selected in the preview are saved to your existing private Supabase household. Original files are not uploaded or retained by the app.

1. On Accounts, create the relevant accounts (for example SoFi Checking, SoFi Savings, Discover, and Amex Blue Cash Everyday). Enter the opening balance **immediately before the first imported date**. Credit/debt balances owed are negative. Do not use today's balance and then import older transactions on top of it. Imports before the opening date are blocked. Use **Edit account** to correct its opening balance/date (confirmation required), or choose a later export range. Existing transactions must remain on or after the revised opening date.
2. Download CSV transactions from your bank. A SoFi Relay all-transactions export is supported: choose **SoFi / SoFi Relay** and then select one **Source account in file**. Map that source to the correct **app account**. Repeat for the other accounts. Account numbers/names from the source file are not stored in transaction notes.
3. Confirm date/description/amount columns and the sign convention. SoFi Relay uses positive inflows and negative outflows. Discover/Amex presets assume positive charges and negative credits; verify against your own export before saving. Direct Discover/Amex exports have synthetic format coverage but a real export from those issuers has not yet been checked. Column mapping supports signed amounts or separate debit/credit columns and US or day-first dates with four-digit years. Posted date is preferred where available.
4. Preview and choose categories/types. Known bank categories suggest matching app categories; others default to Miscellaneous. Bank credits default to income; card credits default to refunds. Change these when needed. Pending, invalid, zero-value and before-opening-date rows cannot be imported. PDF/QFX/OFX statements are not supported in this release.
5. Possible transfers/card payments and duplicates are **skipped by default**. For a transfer you choose to include, select the other app account. It updates both balances without income/spending. Import it only once across both account files; matched same-day transfers cannot be added twice. Posting dates may differ across accounts, so review unmatched payments manually. Automatic matching is conservative and cannot guarantee that every duplicate or transfer is found.
6. Check the projected balance change, confirm review, and import. There is no success message until storage succeeds; errors keep the preview open. Afterward check balances and the imported dates in Transactions. Individual imported transactions can be edited/deleted normally.

Limits: 2 MB per CSV and 2,000 rows per import; household storage retains its existing 2 MB document limit. No real financial CSV or downloaded backup should ever be committed to this public repository. Tests use fictional CSV strings. The user-supplied SoFi Relay file was checked locally for compatibility (631 rows, five source accounts, zero parsing errors) without saving its financial records or including them in source control.

## Architecture and financial rules

React + TypeScript + Vite keeps the UI small and portable. Supabase supplies email/password authentication and Postgres; GitHub Pages is the selected static host for testing. Fonts are self-hosted npm assets; no analytics or bank connections.

For a single household, one JSON document per authenticated user keeps multi-account ledger changes and bill/payment changes atomic. Postgres RLS restricts reads to `auth.uid()`. Direct client writes are revoked; an authenticated RPC derives its owner from the JWT and applies revision comparison to reject stale writes from another device. Reload from cloud in Settings before retrying a conflict. Refresh/sign-in loads the latest saved data; this release does not provide live push synchronization. Documents have a 2 MB application cap, suitable for an initial household ledger; migration to normalized tables/pagination is a later scaling step.

- Money is integer cents. Balances are derived from opening balances plus ledger entries.
- Assets have positive signed balances; amounts owed are negative. Opening balances never count as income.
- Expenses decrease the source balance; income and refunds increase it. Transfers decrease one account and increase another, with no income/spending effect.
- Credit purchases count as spending; paying a card is a transfer. For debt payments, record principal as a transfer and interest/fees as separate expenses against the debt or payment account as appropriate. There is not yet a dedicated split-payment form.
- Refunds reduce category spending. Editing/deleting recalculates totals.
- Transactions cannot predate either affected account's opening date. Dates are local calendar strings, not UTC timestamps. A configurable household timezone remains planned.
- Monthly budgets are independent of actual balances. Limits default to starter settings until set for a month.
- Basic bills support one-time/monthly occurrences. Paying records one linked expense and creates the next monthly occurrence. The original scheduled day is preserved across short months. Deleting its payment makes the bill unpaid. Alerts are in-app only.
- CSV export reflects the selected month/filters and escapes spreadsheet formula prefixes. Full JSON export includes all implemented data; keep exports private. Replacement restore is not implemented yet.

## Service limits verified October 15, 2026

Official pages were fetched successfully during implementation (after adding their domains to the environment network draft):

| Service                                                                           | Verified free-tier limits relevant here                                                              | Caveat                                                                                   |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [Supabase Free](https://supabase.com/pricing)                                     | 500 MB database, 50,000 monthly active users, 5 GB egress, 1 GB file storage; 2 active free projects | Free projects pause after 1 week of inactivity. No paid plan enabled.                    |
| [Cloudflare Pages Free](https://developers.cloudflare.com/pages/platform/limits/) | 500 builds/month, 1 concurrent build, 20-minute build timeout, 20,000 files/site, 25 MiB/asset       | Requires a Cloudflare account. This app uses static hosting, no paid Workers or add-ons. |

These limits comfortably cover a single household at this stage. Limits can change; recheck the linked official pages before provisioning or upgrading. Free-tier pausing is a real availability tradeoff. Paid services require explicit user approval.

## Hosting setup: GitHub Pages (prepared, not deployed)

The user selected GitHub Pages for testing. It hosts only the static React app; Supabase remains responsible for authentication, authorization and saved financial data. GitHub Pages is free for public repositories; private repository support requires an eligible paid GitHub plan. Do not change repository visibility or enable a paid plan without user approval. Source code and public browser configuration can be visible; financial records and passwords must never be committed.

1. Ensure the app source, lockfile and `.github/workflows/deploy-pages.yml` are uploaded to this repository's `main` branch. The current workspace files have not yet been pushed.
2. Open the repository on GitHub → Settings → Pages → Build and deployment → Source → **GitHub Actions**.
3. Open Settings → Secrets and variables → Actions → **Variables**. Add repository variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` using the URL and public publishable key already configured in ignored `.env.local`. Never use a secret/service-role key. Vite embeds these public values into the compiled app.
4. Push the workflow to `main` or open Actions → Deploy app to GitHub Pages → Run workflow. The workflow installs locked dependencies, runs financial/database tests, builds using the repository name as the Vite asset base, and deploys `dist`.
5. Use the actual published URL shown by GitHub's successful deployment. For this repository the expected default URL is `https://piggysaysrawr.github.io/Budgeting-Web-App/`, but it has not yet been published or verified.
6. In Supabase → Authentication → URL Configuration, set Site URL to the published URL and add that same URL to Redirect URLs. The current password sign-in does not redirect, but invitations/recovery rely on this configuration.
7. Sign in, create a test account and transaction, refresh and sign out/in, then check from another device. Verify the expected stored data and delete test entries when done. Do not claim production sync before these checks pass.

Cloudflare Pages remains an alternative; its verified free-tier limits above are retained for reference. GitHub Actions/Pages execution and public deployment have not been verified from this workspace.

## Verification

```sh
npm test                 # financial/date tests and local Postgres-compatible RLS/RPC test
npm run build            # strict TypeScript and production build
npx playwright test      # Chromium at 1440px desktop and 390px mobile
```

Browser configuration uses `/usr/bin/chromium` in this cloud workspace. For another machine, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its Chromium binary or install Playwright Chromium and remove that executable override. Screenshots are generated in ignored `test-results/` and inspected during development. Database tests use PGlite to exercise the actual SQL; they are not evidence of a deployed Supabase project.

## Implementation stages and outstanding scope

1. **Foundation (this release):** accounts/opening balances, manual transactions, persistence adapter, private sign-in, integer-cent balances, monthly budget limits, transaction filters/edit/delete, one-time/monthly bills, CSV/JSON exports, light/dark responsive UI, automated checks. Hosted integration remains unverified until external setup is complete.
2. **Complete core planning:** full recurring bill frequencies, occurrence editing and existing-payment linking, adjustable due-soon window, bill calendar, category reorder, split debt-payment UX, configurable timezone, validated restore, account editing/archiving, and password recovery UX.
3. **Income and forecasting:** multiple job schedules, paycheck overrides/received links, unpaid bills before next paycheck, 30-day estimated cash flow without double counting.
4. **Goals and reporting:** non-overlapping savings allocations, dated goal targets, category/month/job reports with accessible charts.

The Savings screen explicitly labels goal planning as upcoming. No push/email reminders, hosting, or production authentication are claimed to work until separately configured and tested.
