# Lite YNAB

Mobile-first budgeting app built with Next.js and Supabase.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Run the SQL in `supabase/migrations`.
4. Install dependencies with `npm install`.
5. Start with `npm run dev`.

## Supabase notes

- Create one auth user first, then run `supabase/seed.sql` if you want demo categories inserted for the first user.
- The app can also bootstrap default categories on first sign-in through the provided RPC.
