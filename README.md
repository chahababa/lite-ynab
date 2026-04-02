# Lite YNAB

Mobile-first budgeting app built with Next.js and Supabase.

## Project Status

- GitHub repo: `https://github.com/chahababa/lite-ynab`
- Main branch: `main`
- Frontend: Next.js App Router + Tailwind CSS
- Backend/data: Supabase Auth + Postgres + RLS
- Current app routes: `/`, `/login`, `/quick-entry`

## What Is Already Implemented

- Email/password login page
- Dashboard with month switching
- Monthly income editing
- Lazy monthly budget initialization through Supabase RPC
- Budget list with remaining balance and overspending warning
- Recent 10 transactions with edit/delete
- Quick Entry page with Taipei date default and quick category buttons
- Supabase migration and seed files

## Local Setup

1. Clone the repo:

```powershell
git clone https://github.com/chahababa/lite-ynab.git
cd lite-ynab
```

2. Install dependencies:

```powershell
npm install
```

3. Copy `.env.example` to `.env.local`.

4. Fill in:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

5. Run the SQL migration in:

`supabase/migrations/202604020001_init_lite_ynab.sql`

6. If you want demo data, first create one Supabase Auth user, then run:

`supabase/seed.sql`

7. Start the app:

```powershell
npm run dev
```

8. Optional validation:

```powershell
npm run typecheck
npm run build
```

## Supabase Notes

- Tables: `categories`, `monthly_incomes`, `budgets`, `transactions`
- RLS is enabled and scoped to `auth.uid()`
- The app uses `bootstrap_default_categories()` and `initialize_monthly_budget(month_id)` RPC functions
- Default categories can be auto-created on first sign-in through the RPC

## Important Files

- `src/app/page.tsx`: main dashboard
- `src/app/quick-entry/page.tsx`: quick entry flow
- `src/app/login/page.tsx`: auth screen
- `src/lib/data.ts`: Supabase reads and dashboard aggregation
- `src/lib/utils.ts`: Taipei date and formatting helpers
- `supabase/migrations/202604020001_init_lite_ynab.sql`: schema, RLS, RPC
- `supabase/seed.sql`: demo seed data

## Handoff For Another Computer Or AI

If you are an AI assistant continuing this project on another machine, start here:

1. Read this `README.md`.
2. Confirm `.env.local` exists with valid Supabase values.
3. Confirm the migration has been executed in the target Supabase project.
4. Run `npm install`.
5. Run `npm run typecheck`.
6. Run `npm run dev` for local development or `npm run build` for compile verification.

Current product expectations:

- This is a standalone repo, no longer nested under the Telegram diary bot project.
- The app is single-user login oriented through Supabase Auth.
- Timezone-sensitive dates must use `Asia/Taipei`.
- Do not replace the budgeting logic with bank-account reconciliation; keep it envelope-budget focused.
- Quick Entry should stay in-page after success and clear the amount for rapid repeated entries.

## Cross-Computer Checklist

- Push your latest changes before switching computers:

```powershell
git status
git add .
git commit -m "your message"
git push
```

- On the next computer:

```powershell
git clone https://github.com/chahababa/lite-ynab.git
cd lite-ynab
npm install
```

- Recreate `.env.local`
- Run `npm run dev`

## Security Reminder

- Do not commit `.env.local`
- Store Supabase keys in a password manager or secure notes
- If any real keys were exposed elsewhere, rotate them
