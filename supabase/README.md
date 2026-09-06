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
3. Enable **Supabase Auth** as the JWT audience.
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
