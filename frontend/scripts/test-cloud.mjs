import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

if (process.env.F1NANCER_LIVE_TEST !== '1' || process.env.VITE_USE_FIREBASE_EMULATORS !== '1') {
  throw new Error('Run inside Firebase auth/firestore emulators with F1NANCER_LIVE_TEST=1 and VITE_USE_FIREBASE_EMULATORS=1.');
}

const origin = 'http://127.0.0.1:5173';
const server = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1'], {
  env: { ...process.env, VITE_FIREBASE_PROJECT_ID: 'f1nancer-rules-test' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', chunk => { serverLog += chunk; });
server.stderr.on('data', chunk => { serverLog += chunk; });

async function poll(action, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { const value = await action(); if (value) return value; } catch { /* retry */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for Firebase sync condition.');
}

async function emulatorPasswordSignIn(email, password) {
  const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  if (!response.ok) throw new Error(`Auth emulator sign-in failed (${response.status}).`);
  return response.json();
}

async function accountReadStatus(authResult) {
  const path = `http://127.0.0.1:8080/v1/projects/f1nancer-rules-test/databases/(default)/documents/users/${authResult.localId}`;
  return (await fetch(path, { headers: { authorization: `Bearer ${authResult.idToken}` } })).status;
}

async function accountRecord(authResult) {
  const path = `http://127.0.0.1:8080/v1/projects/f1nancer-rules-test/databases/(default)/documents/users/${authResult.localId}`;
  const response = await fetch(path, { headers: { authorization: `Bearer ${authResult.idToken}` } });
  if (!response.ok) throw new Error(`Could not read the test account (${response.status}).`);
  return response.json();
}

async function signIn(page, email, password, create = false) {
  await page.goto(origin);
  if (create) await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: create ? 'Create account' : 'Sign in', exact: true }).click();
  if (create) {
    await poll(() => page.getByRole('heading', { name: 'Verify your email' }).isVisible());
    const unverifiedAuth = await emulatorPasswordSignIn(email, password);
    if (await accountReadStatus(unverifiedAuth) !== 403) throw new Error('Unverified account unexpectedly received Firestore access.');
    const codes = await poll(async () => {
      const response = await fetch('http://127.0.0.1:9099/emulator/v1/projects/f1nancer-rules-test/oobCodes');
      if (!response.ok) return null;
      const body = await response.json();
      return body.oobCodes?.find(code => code.email === email && code.requestType === 'VERIFY_EMAIL') ?? null;
    });
    const verified = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=fake-api-key', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ oobCode: codes.oobCode }),
    });
    if (!verified.ok) throw new Error(`Auth emulator rejected verification code (${verified.status}).`);
    await page.getByRole('button', { name: 'I verified my email' }).click();
  }
  await poll(() => page.locator('.shell').isVisible());
  if (create) {
    const verifiedAuth = await emulatorPasswordSignIn(email, password);
    const verifiedReadStatus = await accountReadStatus(verifiedAuth);
    if (verifiedReadStatus !== 200) throw new Error(`Verified account profile was not readable after seeding (${verifiedReadStatus}).`);
  }
}

let browser;
try {
  await poll(async () => (await fetch(origin)).ok);
  browser = await chromium.launch({ headless: true });
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  first.on('console', message => { if (message.type() === 'error') console.error(`browser: ${message.text()}`); });
  second.on('console', message => { if (message.type() === 'error') console.error(`browser: ${message.text()}`); });
  const email = `firestore-test-${Date.now()}@example.com`;
  const password = 'Test-password-123!';
  await signIn(first, email, password, true);
  await signIn(second, email, password);
  const verifiedAuth = await emulatorPasswordSignIn(email, password);
  await first.getByRole('link', { name: 'Settings' }).click();
  const consent = first.getByRole('checkbox', { name: /Receive occasional F1nancer product updates/ });
  await consent.click();
  await poll(async () => {
    const fields = (await accountRecord(verifiedAuth)).fields;
    return fields.marketing_email_consent?.booleanValue === true
      && typeof fields.marketing_email_consent_at?.stringValue === 'string';
  });
  await consent.click();
  await poll(async () => {
    const fields = (await accountRecord(verifiedAuth)).fields;
    return fields.marketing_email_consent?.booleanValue === false
      && fields.marketing_email_consent_at?.nullValue === null;
  });
  await poll(() => first.evaluate(async () => {
    const { getPowerSync } = await import('/src/sync/database.ts');
    const db = getPowerSync();
    return (await db.getAll('SELECT id FROM currencies')).length > 0
      && (await db.getAll("SELECT id FROM categories WHERE type='expense'")).length > 0;
  }), 45000);

  const ids = await first.evaluate(async () => {
    const { getPowerSync } = await import('/src/sync/database.ts');
    const db = getPowerSync(); const [currency] = await db.getAll('SELECT code FROM currencies LIMIT 1');
    const [category] = await db.getAll("SELECT id FROM categories WHERE type='expense' LIMIT 1");
    const id = crypto.randomUUID(); const now = new Date().toISOString();
    await db.execute(`INSERT INTO transactions (id,user_id,amount,currency_code,date,type,category_id,note,recurring_id,goal_id,credit_debt_id,money_location,created_at,updated_at)
      SELECT ?,user_id,12345,?,date('now'),'expense',?,'Firebase emulator test',NULL,NULL,NULL,'card',?,? FROM settings LIMIT 1`,
      [id, currency.code, category.id, now, now]);
    return { id };
  });
  await poll(() => second.evaluate(async id => {
    const { getPowerSync } = await import('/src/sync/database.ts');
    return (await getPowerSync().getAll('SELECT amount FROM transactions WHERE id=?', [id]))[0]?.amount === 12345;
  }, ids.id), 45000);

  await firstContext.setOffline(true);
  await first.evaluate(async id => {
    const { getPowerSync } = await import('/src/sync/database.ts');
    await getPowerSync().execute('UPDATE transactions SET amount=?,updated_at=? WHERE id=?', [54321, new Date().toISOString(), id]);
  }, ids.id);
  await poll(() => first.evaluate(async () => {
    const { getPowerSync } = await import('/src/sync/database.ts');
    return (await getPowerSync().getUploadQueueStats()).count > 0;
  }));
  await firstContext.setOffline(false);
  await poll(() => second.evaluate(async id => {
    const { getPowerSync } = await import('/src/sync/database.ts');
    return (await getPowerSync().getAll('SELECT amount FROM transactions WHERE id=?', [id]))[0]?.amount === 54321;
  }, ids.id), 45000);

  // An offline delete must not erase a newer edit made on another device.
  await firstContext.setOffline(true);
  await first.evaluate(async id => {
    const { getPowerSync } = await import('/src/sync/database.ts');
    await getPowerSync().execute('DELETE FROM transactions WHERE id=?', [id]);
  }, ids.id);
  await poll(() => first.evaluate(async () => {
    const { getPowerSync } = await import('/src/sync/database.ts');
    return (await getPowerSync().getUploadQueueStats()).count > 0;
  }));
  await second.evaluate(async id => {
    const { getPowerSync } = await import('/src/sync/database.ts');
    await getPowerSync().execute('UPDATE transactions SET amount=?,updated_at=? WHERE id=?', [77777, new Date().toISOString(), id]);
  }, ids.id);
  await poll(() => second.evaluate(async () => {
    const { getPowerSync } = await import('/src/sync/database.ts');
    return (await getPowerSync().getUploadQueueStats()).count > 0;
  }));
  await poll(() => second.evaluate(async () => {
    const { getPowerSync } = await import('/src/sync/database.ts');
    return (await getPowerSync().getUploadQueueStats()).count === 0;
  }), 45000);
  await firstContext.setOffline(false);
  await poll(() => first.evaluate(async id => {
    const { getPowerSync } = await import('/src/sync/database.ts');
    const db = getPowerSync();
    return (await db.getAll('SELECT amount FROM transactions WHERE id=?', [id]))[0]?.amount === 77777
      && (await db.getAll('SELECT id FROM f1_conflicts')).length > 0;
  }, ids.id), 45000);

  // A non-stale delete propagates normally.
  await second.evaluate(async id => {
    const { getPowerSync } = await import('/src/sync/database.ts');
    await getPowerSync().execute('DELETE FROM transactions WHERE id=?', [id]);
  }, ids.id);
  await poll(() => second.evaluate(async () => {
    const { getPowerSync } = await import('/src/sync/database.ts');
    return (await getPowerSync().getUploadQueueStats()).count > 0;
  }));
  await poll(() => first.evaluate(async id => {
    const { getPowerSync } = await import('/src/sync/database.ts');
    return (await getPowerSync().getAll('SELECT id FROM transactions WHERE id=?', [id])).length === 0;
  }, ids.id), 45000);
  console.log('PASS: verified-email Firebase Auth, reversible email consent, two-device Firestore sync, offline recovery, stale-delete conflict protection, and delete propagation');
} catch (error) {
  for (const page of browser?.contexts().flatMap(context => context.pages()) ?? []) {
    console.error((await page.locator('body').innerText().catch(() => '')).slice(0, 2000));
  }
  console.error(serverLog.slice(-4000));
  throw error;
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
