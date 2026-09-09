# Cloud repair verification

Verified on 10 September 2026. The implementation and deployed upload service have passed the checks below. **Native desktop ↔ Android end-to-end acceptance remains open.** Browser clients are not substitutes for that final device test.

## Deployed service

- Additive migration `20260909173234_reliable_sync` is applied and recorded in migration history on the configured Supabase project.
- All ten published tables have RLS enabled and authenticated read/write grants. PowerSync publication membership includes every finance table and profiles.
- Logical replication is active. A post-test check measured 480 bytes of replication lag.
- Real Supabase login tokens were accepted by PowerSync. Fresh isolated clients downloaded every finance table through the deployed stream configuration.
- The new authenticated RPC was exercised against deployed PostgreSQL before application. The complete migration and its transactional, ownership, reference, uniqueness and idempotency behavior also run in the local PostgreSQL regression suite.
- Security advisors reported no errors and no findings for the new sync function or private tables. Fourteen warnings concerning existing functions, extensions and authentication configuration remain outside this change.
- Disposable test accounts were removed. After the tests, the original aggregate counts remained unchanged: two profiles, 33 categories, three goals and 18 transactions. No existing account was used as a write-test fixture.

## Automated checks

`npm --prefix frontend run test:sync`: 10 passing tests using real SQLite and an embedded PostgreSQL instance. These cover every backup table, IDs, relationships, statuses, nulls, repeat imports, explicit conflicts, malformed/wrong-account files, rollback, stale previews, upload acknowledgement, ownership, uniqueness aliases, retry receipts, referenced category deletion, serialized transitions, cached token expiry and rejected-upload repair with retained original values.

`backend/.venv/bin/python -m unittest discover -s desktop/tests -v`: four passing tests covering stable local address, refusal to change an occupied address, backup file-dialog behavior, and a consistent one-time safety copy of the previous SQLite database. File dialogs are mocked; these tests do not prove WebView persistence in an installed package.

`F1NANCER_LIVE_TEST=1 npm --prefix frontend run test:cloud`: passing against the deployed Supabase and PowerSync services, using three independent Chrome storage contexts:

1. Fresh download and both directions of cloud transfer.
2. Offline edits, reconnection, and visible screen refresh without reload.
3. Equality of all nine tables, including IDs, fields, relationships, statuses and server timestamps.
4. Export through the Settings download control and import through the file picker on a fresh client with cloud uploads and downloads blocked.
5. Repeated import without duplicates and data retention after reload.
6. An unseen newer cloud value is preserved until the user explicitly chooses the imported value.
7. A rejected reference is corrected and retried through the recovery UI; original operation values remain saved.
8. Pending changes survive sign-out and reload, and reach the other client after reconnecting.
9. An expired cached session allows access to saved local data while authentication and sync endpoints are unreachable.

A separate Mac preview package was built at `desktop/dist/sync-repair/F1nancer.app` and opened successfully to the sign-in screen with an isolated test data directory. It was not installed over the existing application. This smoke test does not establish packaged database persistence across restarts.

Frontend production build and mobile TypeScript checks pass. The Android Expo export produces a Hermes bundle with the native SQLite, document selection and sharing dependencies included. Lint exits successfully with React effect/style warnings; production bundling reports the existing large-chunk warning.

## Data protection and transfer

- Startup keeps the old browser database when ownership can be established; otherwise it preserves that file and opens a separate account database.
- Desktop startup saves `before-cloud-repair.db` beside an existing `f1nancer.db` before the backend opens it. This safety copy is never refreshed over the original snapshot.
- Sign-out retains local data and uploads. The former destructive clear/import controls were removed; there is no automatic empty-cache legacy migration.
- Explicit legacy import and portable imports use the same validated, transactional merge path. Every import first saves a recovery snapshot.
- Use **Settings → Data & sync** on desktop/web or **Account → Backup & transfer** on mobile. Export, transfer the JSON file, sign into the same account, import and review the merge. These files contain readable financial information.

## Remaining release acceptance

No Android SDK, emulator, connected Android device or Windows environment was available. The Android export is **not an APK installation test**. Installed Android restart persistence, native picker/sharing behavior, Windows WebView persistence, and real packaged desktop → fresh Android / Android → fresh packaged desktop transfers must still be tested.

The local desktop and mobile environment files target the same Supabase and PowerSync services. Release workflows reject missing configuration, but remote release-secret values were not read. PowerSync dashboard configuration was not exported; deployed authentication and all-table downloads were verified by actual clients.

Before release, build the Android APK and desktop installers with matching configuration. Export a backup from the original device first. Run both transfer directions and offline reconnects with disposable records, compare all IDs and values, restart each installed app, and verify that pending edits survive sign-out/restart. Do not label the full native cloud repair complete until those checks pass.
