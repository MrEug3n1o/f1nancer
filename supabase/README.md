# Cloud sync setup

F1nancer stores finance data in **Supabase Postgres** and syncs it to on-device SQLite via **PowerSync**. Username + password login is shared across desktop and mobile.

## 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor (or `supabase db push` with the CLI), apply migrations in [`migrations/`](migrations/).
3. Auth → Providers → Email: disable **Confirm email** (usernames use synthetic addresses `name@users.f1nancer.local`).
4. Deploy functions:

```bash
supabase functions deploy auth-username
supabase functions deploy process-recurring
```

5. Schedule `process-recurring` daily (Dashboard → Edge Functions → Schedules) with header `x-cron-secret: <RECURRING_CRON_SECRET>`. Hosted Postgres may already run `process_due_recurring_rules()` via pg_cron from the migration.

## 2. PowerSync

1. Create an instance at [PowerSync](https://www.powersync.com/) and connect it to the Supabase database.
2. Use the `powersync` publication created by the migration.
3. Client Auth:
   - Enable **Use Supabase Auth**.
   - Under **JWT Audience**, add `authenticated` (Supabase’s access-token `aud`). An empty audience list causes `PSYNC_S2105` / `Unexpected "aud" claim value: "authenticated"`.
   - If using Supabase’s **new JWT signing keys** (JWKS URI), leave the legacy JWT secret empty. If using **legacy** HS256 keys, paste the Supabase JWT secret instead.
   - Click **Save and Deploy**, then sign out and back in on the client.
4. Deploy [`sync-rules.yaml`](sync-rules.yaml).

## 3. Client env

Desktop (`frontend/.env`):

```
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
VITE_POWERSYNC_URL=https://YOUR_INSTANCE.powersync.journeyapps.com
```

Mobile (`mobile/.env`):

```
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
EXPO_PUBLIC_POWERSYNC_URL=https://YOUR_INSTANCE.powersync.journeyapps.com
```

Optional: `RECURRING_CRON_SECRET` for the process-recurring function.

## Reliable upload migration

Apply `20260909173234_reliable_sync.sql` before releasing the repaired clients. The migration is additive: finance table IDs, account IDs, and PowerSync stream names stay unchanged. New clients upload through `public.apply_sync_batch(uuid, jsonb)`; a missing function is shown as a server-upgrade requirement and the local queue remains intact.

The authenticated wrapper calls a private function with explicit account and reference checks. Private receipts make retries idempotent using the database-instance UUID and local operation ID. Settings, currencies, and budgets retain their canonical cloud IDs through a durable alias map. Neither receipts nor aliases belong in the PowerSync publication. Imports carry merge metadata; unseen cloud conflicts return evidence that the client persists before acknowledging the upload.

A complete deployment check includes all ten published tables, matching Supabase/PowerSync endpoints in desktop and Android builds, client JWT audience `authenticated`, active logical replication, and the deployed `user_data` stream. Database replication being healthy does not prove that a client has downloaded its data.

The release regression suite runs without cloud credentials. `frontend/scripts/test-cloud.mjs` is an opt-in live verification that cleans up its own temporary account. Never use a user's finance account as a write-test fixture.
