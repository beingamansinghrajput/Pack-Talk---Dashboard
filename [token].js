# Setup Guide — Survey Dashboard

This gets you a live website your TLs can log into with their own email + password,
backed by a real database. No coding needed from here — just following steps.

Total time: ~30–40 minutes the first time.

---

## Part 1 — Create the database (Supabase, free)

1. Go to https://supabase.com → **Start your project** → sign up (GitHub or email).
2. Click **New Project**.
   - Name: `survey-dashboard` (anything)
   - Database password: generate + **save it somewhere** (a password manager, not a text file you'll lose)
   - Region: pick the one closest to you (e.g. Mumbai / Singapore)
   - Click **Create new project** and wait ~2 minutes.
3. Once it's ready, go to the left sidebar → **SQL Editor** → **New query**.
4. Open the file `supabase/schema.sql` from this project, copy **all** of it, paste it into the SQL editor, click **Run**.
   - You should see "Success. No rows returned."
5. Go to left sidebar → **Project Settings** (gear icon) → **API**.
   - Copy the **Project URL** and the **anon public** key — you'll need both in Part 3.

---

## Part 2 — Create login accounts for yourself and your TLs

1. In Supabase, left sidebar → **Authentication** → **Users** → **Add user** → **Create new user**.
2. Enter your own email + a password. Untick "Auto Confirm User" only if you want an email
   verification step — for an internal tool, leave it **checked** so you can log in immediately.
3. Repeat for each TL — one email + password per person. (You choose their password and share
   it with them directly, or use "Send invite" to email them a signup link instead — your call.)
4. **Make yourself admin:** go back to **SQL Editor** → New query → run:
   ```sql
   update profiles set role = 'admin' where email = 'YOUR_EMAIL_HERE';
   ```
   Everyone else defaults to role `tl` (Team Lead) — they can view the dashboard and punch in
   data, but can't create projects or manage the team. You can promote anyone to admin later
   from the **Team** page inside the app itself.

---

## Part 3 — Run it on your computer first (to test)

1. Install [Node.js](https://nodejs.org) (LTS version) if you don't have it.
2. Open a terminal in this project folder and run:
   ```bash
   npm install
   ```
3. Copy `.env.example` to a new file named `.env`, and fill in the two values from Part 1 step 5:
   ```
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```
4. Run:
   ```bash
   npm run dev
   ```
5. Open the printed URL (usually `http://localhost:5173`) — log in with the account you created
   in Part 2. Go to **Manage Projects** and add your first project, then try **Punch In Data**.

If that all works, you're ready to put it online.

---

## Part 4 — Put it online (Vercel, free)

1. Push this project folder to a GitHub repo (create one at https://github.com/new, then follow
   GitHub's "push an existing folder" instructions — or ask me and I'll walk you through git
   commands specifically).
2. Go to https://vercel.com → sign up with GitHub → **Add New Project** → import your repo.
3. Vercel auto-detects it's a Vite app. Before clicking Deploy, expand **Environment Variables**
   and add the same two values from your `.env` file:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Click **Deploy**. In ~1 minute you'll get a live URL like `survey-dashboard.vercel.app`.
5. Share that URL with your TLs — they log in with the email/password you created for them in Part 2.

---

## Day-to-day usage after this

- **Add a new survey** → Manage Projects (admin only) → fill the form.
- **Log respondents** → Punch In Data → manual form for one-offs, or Excel upload for bulk.
  Excel file needs columns: `UID, Start Time, End Time, Country, Screener Pass, Quota Status, Survey Completed`
- **View results** → Dashboard shows Today/This Month totals + a project table; click any
  Project ID to see the full respondent-level table like your reference screenshots.
- **Add/manage TLs** → create their login in Supabase (Part 2), they'll appear automatically
  on the **Team** page the first time they sign in.

## If something breaks

- Blank page / can't log in → check `.env` values are exactly right, restart `npm run dev`.
- "row-level security" errors → you skipped running `schema.sql`, or your account has no
  `profiles` row yet (log in once through the app first, the trigger creates it automatically).
- Excel upload does nothing → check the column headers match exactly (case doesn't matter, but
  spelling does).

Send me the exact error message any time and I'll debug it with you.
