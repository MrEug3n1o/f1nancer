# Firebase migration runbook

This migration replaces Supabase Auth, Supabase Postgres, and PowerSync with
Firebase Authentication and Cloud Firestore. Do not delete or disable any of
the old services until the reconciliation and rollback gates below pass.

## Provisioned so far

- Firebase project: `f1nancer`
- Firebase Web app: `F1nancer Desktop`
- Firebase Android app: `F1nancer Android` (`app.f1nancer.mobile`)
- Authentication provider: Email/Password enabled
- Anonymous authentication: disabled
- Firestore database: `(default)`, Standard edition, Native mode, location `eur3`
- Firestore production Security Rules: deployed successfully
- Security Rules emulator suite: 12/12 owner-isolation, verified-email,
  same-owner reference, orphan prevention, bounds, and schema tests passing;
  the tightened rules compiled and were deployed to production
- Auth/Firestore emulator acceptance: mandatory email verification, idempotent
  account seeding, two-session sync, offline queue/reconnect, stale-delete
  conflict protection, and delete propagation passing
- Full migration emulator rehearsal: one legacy Auth user, all nine finance
  collections, global/per-user checksums, and an idempotent resume pass with
  zero duplicate Auth users passing
- Real Supabase read-only source audit on 2026-09-12: 3 exact Auth/profile
  pairs; all 3 use valid legacy synthetic emails; 6 currencies, 51 categories,
  3 settings, 3 goals, 1 deposit, 1 credit/debt, 1 recurring rule, 1 budget,
  and 18 transactions; ownership, references, and bcrypt formats passing
- Firebase Auth users: zero before migration
- Production Firebase smoke test on 2026-09-13: verified-owner account creation,
  finance-document creation, owner read, consent opt-in, cross-owner denial,
  unverified-email denial, and account-delete denial all passed against the
  deployed services. Both temporary Auth users and all temporary Firestore
  documents were deleted and a separate residue check returned zero.
- Authentication configuration verified on 2026-09-13: Email/Password is
  enabled, passwords are required, Firebase verification/reset templates are
  provisioned, and `f1nancer.firebaseapp.com` plus `f1nancer.web.app` are
  authorized domains.

The Android client configuration is committed as
`mobile/google-services.json`. Firebase client API keys identify the project;
they are not administrator secrets. Database access must still be restricted by
Firestore Security Rules.

## Production cutover record — 2026-09-13

- Supabase authenticated writes were frozen across all ten source tables, both
  sync RPCs, the recurring-rule RPC, and the recurring cron job. Supabase reads
  remain available for reconciliation and rollback.
- The post-freeze custom-format backup
  `f1nancer-cutover-2026-09-13-120007.dump` is retained locally with `0600`
  permissions. It is 140,261 bytes, contains all 11 required Auth/public table
  data entries, and has SHA-256
  `e5e048a13accedfc3f30a3957b3d4ad43168ff3a579a73f7112c95a4d2ab31d0`.
- The production apply imported all 3 Auth users with their original UIDs,
  verification/disabled states, and Supabase bcrypt hashes, then wrote 88
  account and finance documents. The independent verifier reported zero Auth,
  profile, document-set, count, row, per-user, ownership, relationship, or
  migration-state mismatches. Source checksum:
  `1f6f65d71491bf6c17d2130d64d41b302aea94c3aa7e0041e6cf711eb70b61ab`.
- A temporary production `$2a$` bcrypt import successfully signed in with its
  original password, proving the same hash format used by Supabase works in
  Firebase Auth. All temporary Auth and Firestore records were removed.
- Release [`v0.1.24`](https://github.com/MrEug3n1o/f1nancer/releases/tag/v0.1.24)
  was built from commit `87a37913610cadfcd13cb3a78bb9bdc87b20c681` for
  macOS, Windows, and Android. The first `v0.1.23` package exposed a persisted
  WebView document-cache issue during acceptance and was superseded by
  `v0.1.24`, which versions the document URL without changing the IndexedDB/
  OPFS origin and serves HTML with `no-store` headers.
- The downloaded public `v0.1.24` artifacts matched GitHub's recorded SHA-256
  digests; APK ZIP integrity and DMG filesystem integrity passed. The exact
  published macOS app passed verified Firebase sign-in, account seeding,
  Settings lazy-module loading, and zero-error browser checks. The installed
  Mac app is now `0.1.24`; its `0.1.22` bundle is retained as a rollback copy.
- The signed Android APK built successfully, but physical/emulator installation
  acceptance still requires an available Android device. Do not cancel the old
  services or remove their release secrets until that check and an observation
  window have passed.

## Non-negotiable migration invariants

1. Preserve each existing Supabase `auth.users.id` as the Firebase Auth UID.
2. Preserve every record ID, relationship, amount, currency, status, date, and
   timestamp from `profiles`, `currencies`, `categories`, `settings`, `goals`,
   `deposits`, `credit_debts`, `recurring_rules`, `budgets`, and `transactions`.
3. Import Supabase bcrypt password hashes through the Firebase Admin SDK so an
   existing password continues to work. Preserve email-verification and banned
   account state as Firebase `emailVerified` and `disabled`. Never export
   plaintext passwords. Firebase Auth creation metadata cannot be backdated, so
   the original Auth timestamp is retained in the admin-only
   `/migration_state/{uid}` record while profile timestamps remain in
   `/users/{uid}`.
4. Never place the Supabase database password, service-role key, Firebase
   service-account key, or migration output in the desktop/mobile bundles or in
   Git.
5. Make the migration idempotent. A retry may skip identical records but must
   abort on a conflicting UID, email, record ID, or ownership value.
6. Keep Supabase and PowerSync readable during verification. Do not accept new
   writes in both systems after final cutover.
7. Take an independent Supabase database backup immediately before the final
   migration, and retain it through the rollback window.

## Existing-account email limitation

The old signup flow generated addresses such as
`username@users.f1nancer.local`; it never collected the person's real email.
Those real addresses cannot be reconstructed from the database.

Existing users will therefore be imported with their current UID, username,
synthetic email, and password hash. The new app will expose a one-time legacy
account flow:

1. Sign in with the old username and password.
2. Enter a real email address.
3. Confirm the Firebase verification email.
4. Continue signing in with the verified real email.

New registrations use a real email and password from the start. Until the user
opens Firebase's verification link, the app does not seed an account database,
start finance sync, or receive Firestore access. Marketing or product email
must only be sent after recording the user's separate consent; having an
authentication email is not itself marketing consent.
After verification, both desktop and mobile expose an unchecked account
preference for occasional product updates. Opting in records an ISO timestamp;
opting out clears it, and Firestore rules reject inconsistent consent states.

## Required private access for the migration run

- Preferred: the already-authenticated Supabase CLI and linked project, which
  issue a short-lived database login without exposing the permanent database
  password. This route has passed the real source-only audit.
- Fallback: a percent-encoded Supabase Postgres connection URL for project
  `xtqudnqthpakdaonrwir` in the ignored local `.env` file.
- Firebase Admin credentials for project `f1nancer`, preferably Application
  Default Credentials on the migration machine.
- The approved Firestore edition and permanent location (completed: Standard,
  `eur3`).

Keep these values in the shell environment or a local ignored `.env` file.
Never paste them into source files, issues, logs, or chat output.

### Where to authorize access

1. Supabase is already authenticated and linked for this repository. The
   `source-check`, `backup`, `apply`, and `verify` scripts automatically obtain
   a short-lived login, preserve the generated trusted-role switch, and never
   print or save that credential.
2. On the migration Mac, unlock the screen and authorize Firebase Admin without
   downloading a service-account key:

   ```bash
   gcloud auth application-default login you@example.com \
     --scopes=openid,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/cloud-platform
   gcloud auth application-default set-quota-project f1nancer
   ```

   Use the Google account that owns the Firebase project. These scopes cover
   Firebase Admin access and intentionally omit the CLI default Cloud SQL scope,
   which this migration does not need. The quota-project command is required by
   Firebase Auth when ADC contains end-user credentials; it selects the project
   used for API quota and does not enable billing by itself.

   If that account is already valid in `gcloud auth list`, the same local
   credentials can be copied into ADC without another consent flow:

   ```bash
   gcloud auth login you@example.com --update-adc --brief
   gcloud auth application-default set-quota-project f1nancer
   ```

3. Only if temporary Supabase access stops working, use the fallback: open the
   project, click **Connect**, choose **Session pooler**, copy its URI, replace
   `[YOUR-PASSWORD]` locally, and percent-encode reserved password characters.
   Put it in `tools/firebase-migration/.env` as `SUPABASE_DB_URL=...`. Never
   commit it or paste it into chat or logs.

The migration tool never prints emails, usernames, password hashes, connection
strings, temporary credentials, or individual financial records.

### Commands

```bash
cd tools/firebase-migration
npm install
npm run source-check
npm run source-write-status
npm run dry-run:linked
```

`dry-run` is the default and performs source validation plus Firebase UID/email
collision checks without writes. Before the real apply:

```bash
cd tools/firebase-migration
# Keep reads working while old clients retain rejected writes in their durable
# local upload queue. This also pauses the recurring-rule cron job.
npm run freeze-source-writes
# The destination must already exist, be outside Git, and preferably be an
# encrypted volume. The command refuses to overwrite an existing file.
npm run backup -- --output=/secure/path/f1nancer-before-firebase.dump
SUPABASE_BACKUP_CONFIRMED=yes npm run apply
npm run verify
```

The backup command uses the same short-lived Supabase login, creates a `0600`
custom-format archive of the `auth` and `public` schemas, and verifies that its
catalog contains Auth users plus every required profile/finance table. It also
prints a SHA-256 checksum for the cutover record.

For the permanent-URL fallback, run `npm run dry-run`, `npm run apply:env`, and
`npm run verify:env` instead.

`apply` creates resumable migration-state fingerprints, imports bcrypt hashes in
batches while preserving UIDs, writes every finance document, then immediately
runs independent count and checksum reconciliation. Any nonzero mismatch exits
with failure. It also refuses to start while authenticated table writes, sync
RPCs, the recurring-rule RPC, or the recurring cron job remain enabled in the
Supabase source.

## Safe execution order

### 1. Provision and secure Firebase

1. Create the approved Firestore instance (completed: Standard, `eur3`).
2. Enable database delete protection (completed). Point-in-time recovery is
   intentionally still disabled because it can add storage cost.
3. Deploy deny-by-default, owner-scoped Security Rules before importing data
   (completed and emulator-tested).
4. Register the web and Android clients (already complete).
5. Enable Email/Password Authentication (already complete).
6. Authorized domains and Firebase's verification/reset templates are
   provisioned (completed). Customize their sender name and wording in the
   Firebase console before sending the app to a broad audience.

The web and mobile clients now use Firebase email/password auth. The PowerSync
SDK remains only as the on-device SQLite engine; it no longer connects to the
PowerSync service. Firestore transport pushes durable local CRUD first and only
acknowledges it after the server accepts or records a conflict.

The old `VITE_SUPABASE_*`, `VITE_POWERSYNC_URL`,
`EXPO_PUBLIC_SUPABASE_*`, and `EXPO_PUBLIC_POWERSYNC_URL` values are no longer
read by the new clients. Remove them from local `.env` files and GitHub release
secrets after the Firebase build has passed installed-device acceptance; this
does not delete or disable the old services.

### 2. Dry-run migration

The migration program must report only aggregate counts and checksums. It must
verify:

- every profile belongs to exactly one Auth UID;
- every finance record references an existing user;
- category, goal, recurring-rule, and credit/debt references are valid;
- all Supabase password hashes use a Firebase-supported bcrypt format;
- no Firebase UID or email collision exists;
- no unrelated Firebase Auth user, account document, or migration-state record
  exists in the cutover target;
- all source counts remain stable for the duration of the dry run.

### 3. Rehearsal

Run the complete migration against emulators or a disposable Firebase project.
Test an imported account, a newly created email account, data totals, linked
records, offline writes, reconnect, desktop restart, and an installed Android
build. Delete the rehearsal project only after saving the report.

The local, production-guarded fixture rehearsal is:

```bash
env JAVA_HOME=/opt/homebrew/opt/openjdk@21 \
  PATH=/opt/homebrew/opt/openjdk@21/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin \
  firebase emulators:exec --only auth,firestore \
  "env FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=f1nancer-rules-test npm --prefix tools/firebase-migration run rehearse" \
  --project f1nancer-rules-test
```

This passed again on 2026-09-13. It imports a Supabase-style bcrypt record through
Firebase Admin, writes every collection, verifies counts/checksums and linked
records, then reruns the same source to prove resume safety. The source bcrypt
hash is verified against a known password locally. Firebase's Auth emulator
stores imported external hashes but currently authenticates only its own test
hash format, so the imported-password login check must be performed once
against production immediately after the real import and before releasing the
new clients.

### 4. Final cutover

1. Announce a short maintenance window.
2. Run `npm run freeze-source-writes`. It revokes authenticated DML and sync
   RPC execution while leaving reads available, and pauses the recurring-rule
   cron job. Old clients retain rejected operations in their durable local
   queue instead of acknowledging them.
3. Take the final Supabase backup and source-count manifest.
4. Run the migration once.
5. Run reconciliation from a separate read-only verification command.
6. Release the Firebase build only after reconciliation passes.

### 5. Reconciliation gates

For every source table and user, compare:

- record count;
- deterministic content checksum after canonical date/boolean conversion;
- ownership UID;
- all foreign-key relationships;
- a sample of calculated dashboard totals.

Also verify that every imported Auth UID exists exactly once and that a real
installed desktop and Android client can read, write offline, reconnect, and
see the same data.

### 6. Rollback and retirement

If reconciliation or client acceptance fails, keep the Firebase release
disabled and run `npm run restore-source-writes`. The source backup remains
authoritative.

After a successful observation window:

1. Disable the old username-signup Edge Function.
2. Revoke PowerSync write credentials and stop its instance.
3. Revoke Supabase client keys from released Firebase builds.
4. Export one final Supabase archive.
5. Cancel PowerSync only after no supported client version depends on it.
6. Pause or delete Supabase only after every active account has migrated or has
   an explicit recovery path.

Do not delete either service merely because the first Firebase build works.
