# Project conventions

- Read REQUIREMENTS.md before changing behavior. Work in this existing checkout; do not create worktrees unless requested.
- React + TypeScript with Vite; Supabase Auth and Postgres enforce user isolation. Demo mode is fictional, local, and explicitly opt-in.
- USD money uses integer cents. Dates use YYYY-MM-DD calendar strings; never convert ledger dates through UTC timestamps.
- Derive balances from opening balances and ledger entries; transfers are never spending. Debt balances use signed values (negative means owed).
- Keep secrets out of source control. Only the Supabase public URL and publishable/anon key belong in browser configuration. Never use service-role keys.
- Commands: npm ci, npm run dev, npm test, npm run build. Browser checks: npx playwright test.
- Verify changed financial calculations with automated tests. Verify core forms and navigation at mobile and desktop sizes. Report skipped checks and external prerequisites honestly.
- Confirm deletion, validate inputs, await persistent writes, and surface save errors. Preserve accessible labels and keyboard controls.
- Schema changes belong in supabase/schema.sql, with RLS and validation. Never weaken authorization to get a test passing.

- Import tests use fictional CSV strings. Never commit real bank exports. Verify amount signs, multi-account selection, duplicate warnings, transfer direction, and storage failures for importer changes.

## Budget improvements review

- Keep this work on `feature/budget-improvements`; do not commit, merge, or deploy it to `main` without explicit approval.
- Read IMPROVEMENTS.md and REVIEW.md for the additional scope and review steps. Savings goals are deferred by user choice.
- `npm run dev:review` and `npm run build:review` disable cloud authentication and use separate fictional local data. Use review mode for destructive workflow checks; never run tests against the production household.
- Preserve legacy paidTransaction records and existing category IDs. New optional fields must round-trip through the existing atomic household save. No live data migration has been authorized.
