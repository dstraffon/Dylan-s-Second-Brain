# Setting up sync

Sync keeps tasks, notes, links, streaks, projects, weekly reviews and settings the same on every device. It runs on a free [Supabase](https://supabase.com) project. Setup takes about 10 minutes and only happens once.

Until it is set up, the app works exactly as before, saving to this browser only.

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) and sign up (Continue with GitHub is fine).
2. Click **New project**. Name it `second-brain`, click **Generate a password** (you won't need it for the app, but save it in your password manager), pick the region **East US (North Virginia)**, and click **Create new project**. It takes a minute or two to start.

## 2. Create the sync table

1. In the left sidebar, open **SQL Editor**.
2. Copy everything in [`supabase/schema.sql`](../supabase/schema.sql), paste it into the editor, and click **Run**. It should say "Success. No rows returned".

## 3. Point sign-in emails at the app

1. Open **Authentication → URL Configuration**.
2. Set **Site URL** to `https://dstraffon.github.io/Dylan-s-Second-Brain/`.
3. Under **Redirect URLs**, click **Add URL**, add the same address, and save.

## 4. Put a code in the sign-in email

The app signs in with a 6-digit code from an email, which works inside the home-screen app on a phone (a link would open the browser instead). Supabase only lets you edit email templates once you send through your own email provider, so this step connects a free [Resend](https://resend.com) account first.

1. Sign up at resend.com with the same email you'll sign in to Second Brain with (without your own domain, Resend only delivers to that address, which is fine for one person).
2. In Resend, open **API Keys → Create API key** with "Sending access" and copy it (starts with `re_`).
3. In Supabase, open **Authentication → Emails**, click **Set up SMTP**, turn on custom SMTP and enter: sender email `onboarding@resend.dev`, sender name `Second Brain`, host `smtp.resend.com`, port `465`, username `resend`, password the `re_` key. Save.
4. Now the templates are editable. In both **Confirm sign up** and **Magic Link**, switch to **Source**, add this line under the link, and click **Save changes**:
   `<p>Your code: <strong>{{ .Token }}</strong></p>`

If you only ever use the app in a normal browser tab, you can skip this step and tap the link in the email instead.

## 5. Connect the app

1. Open **Project Settings → API Keys** and copy the **Publishable key** (starts with `sb_publishable_`). If you only see legacy keys, copy the **anon public** one. Never copy the **secret** or **service_role** key.
2. Open **Project Settings → Data API** (or the project's Connect button) and copy the **Project URL** (looks like `https://abcdefgh.supabase.co`).
3. In GitHub, open the repository's **Settings → Secrets and variables → Actions → Variables** tab and add two **repository variables**:
   - `SUPABASE_URL`: the Project URL
   - `SUPABASE_KEY`: the publishable key
4. Re-run the deploy (Actions → Deploy to GitHub Pages → Run workflow), or just merge the next change.

Both values are designed to be public; what anyone can read is controlled by the table's row-level security, which only lets a signed-in person see their own rows.

## 6. Sign in on each device

1. Open the app, tap **⚙ Settings**, enter your email under **Sync** and tap **Email me a sign-in code**.
2. Type the code from the email. Anything already on that device is kept and merged with what's in the cloud, and a copy of the device's data from before syncing is saved (Settings has a link to download it).
3. Repeat on the other device.

## 7. Lock it to just you (recommended)

Once both devices are signed in, open **Authentication → Sign In / Providers**, and turn off **Allow new users to sign up**. Your own sign-ins keep working; nobody else can create an account on your project.

## How it works

- Everything still saves to the browser first, so the app is instant and works offline. Changes upload a second later, or as soon as you're back online.
- Each stored list (tasks, notes, projects...) is one row in the `kv` table. If two devices changed the same list, the app merges them item by item, and field by field inside an item, so a task added on the phone and a note edited on the computer both survive. Only when both devices changed the very same field (say, the same task title) does one win: the device that syncs second.
- Device-only things stay on each device: which tab or filter is open, and the weather cache.
- Code: `src/lib/sync/` (`engine.ts` for syncing, `merge.ts` for merging).
