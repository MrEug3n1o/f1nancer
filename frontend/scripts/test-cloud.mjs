/** Opt-in live verification. Uses a disposable account and deletes only that account in finally. */
import { chromium, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
if (process.env.F1NANCER_LIVE_TEST !== '1') throw new Error('Set F1NANCER_LIVE_TEST=1 to authorize a disposable account in the configured cloud project.');
const root = resolve(import.meta.dirname, '../..');
const config = Object.fromEntries(readFileSync(resolve(root,'frontend/.env'),'utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const username = 'synctest_' + randomBytes(6).toString('hex');
const password = randomBytes(24).toString('hex');
const directory = mkdtempSync(resolve(tmpdir(),'f1nancer-cloud-test-'));
let userId; let browser;
const base = process.env.F1NANCER_TEST_URL ?? 'http://127.0.0.1:5173';
async function login(page) {
  await page.goto(base);
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('button',{name:'Retry sync'}).waitFor({timeout:45000});
  await page.evaluate(async()=>{
    const {getPowerSync}=await import('/src/sync/database.ts');
    window.syncEvents=[]; getPowerSync().registerListener({statusChanged:s=>{window.syncEvents.push({at:Date.now(),connected:s.connected,hasSynced:s.hasSynced,down:String(s.dataFlowStatus?.downloadError??''),up:String(s.dataFlowStatus?.uploadError??'')});}});
  });
}
async function poll(page, fn, arg, options = {}) { await expect.poll(() => page.evaluate(fn, arg), { timeout: 60000, ...options }).toBe(true); }
async function waitSync(page) {
  await poll(page,async()=>{try { const {getPowerSync}=await import('/src/sync/database.ts'); const db=getPowerSync(); return db.currentStatus.hasSynced && (await db.getUploadQueueStats()).count===0; } catch{return false;}},null,{timeout:60000});
}
async function snapshot(page) {
  return page.evaluate(async()=>{
    const {getPowerSync}=await import('/src/sync/database.ts'); const {getSupabase}=await import('/src/sync/supabaseClient.ts');
    const {exportBackup}=await import('/@fs'+ROOT+'/packages/domain/src/index.ts');
    const {supabaseUrl}=await import('/src/sync/config.ts');
    const db=getPowerSync();const {data}=await getSupabase().auth.getSession();
    return exportBackup(db,data.session.user.id,supabaseUrl,{hasSynced:!!db.currentStatus.hasSynced,pendingUploads:(await db.getUploadQueueStats()).count});
  });
}
try {
  const response = await fetch(config.VITE_SUPABASE_URL+'/functions/v1/auth-username',{method:'POST',headers:{'Content-Type':'application/json',apikey:config.VITE_SUPABASE_ANON_KEY,Authorization:'Bearer '+config.VITE_SUPABASE_ANON_KEY},body:JSON.stringify({action:'signup',username,password})});
  const created = await response.json(); if(!response.ok) throw new Error(`Test signup failed: ${created.error ?? response.status}`);
  userId=created.user.id;
  browser=await chromium.launch({channel:'chrome',headless:true});
  const a=await browser.newContext();const b=await browser.newContext();
  await a.addInitScript(value=>{window.ROOT=value;},root);await b.addInitScript(value=>{window.ROOT=value;},root);
  const pa=await a.newPage();const pb=await b.newPage();
  await login(pa); await waitSync(pa); console.log('PASS: fresh client completed its first cloud download');
  const ids=await pa.evaluate(async()=>{
    const {handlePost}=await import('/src/data/repo.ts');
    const c=await handlePost('/categories',{name:'Cloud transfer test',type:'income',color:'#123456'});
    const t=await handlePost('/transactions',{amount:12345,currency_code:'USD',date:'2026-09-09',type:'income',category_id:c.id,money_location:'card',note:'Device A transaction'});
    const {getPowerSync}=await import('/src/sync/database.ts');
    const {BACKUP_COLUMNS}=await import('/@fs'+ROOT+'/packages/domain/src/index.ts');
    const db=getPowerSync();
    const user=(await db.getAll('SELECT user_id FROM categories WHERE id=?',[c.id]))[0].user_id;
    const row=async(writer,table,fields)=>{
      const cols=BACKUP_COLUMNS[table];
      const values={...Object.fromEntries(cols.map(k=>[k,null])),id:crypto.randomUUID(),user_id:user,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),...fields};
      await writer.execute(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`,cols.map(k=>values[k]));
      return values;
    };
    await db.writeTransaction(async tx=>{
      const goal=await row(tx,'goals',{name:'Transfer goal',target_amount:100000,current_amount:123,currency_code:'USD',status:'completed'});
      await row(tx,'deposits',{name:'Transfer deposit',type:'bank',principal_cents:1000,currency_code:'USD',start_date:'2026-01-01',end_date:'2026-12-01',status:'matured',money_location:'card'});
      const credit=await row(tx,'credit_debts',{name:'Transfer loan',direction:'debt',source:'bank',principal_cents:1000,currency_code:'USD',start_date:'2026-01-01',status:'paid'});
      const recurring=await row(tx,'recurring_rules',{amount:10,currency_code:'USD',category_id:c.id,type:'income',cadence:'monthly',billing_day:1,next_run_date:'2026-10-01',active:0,money_location:'cash'});
      await row(tx,'budgets',{category_id:c.id,limit_cents:1000,currency_code:'USD'});
      await tx.execute('UPDATE transactions SET goal_id=?,credit_debt_id=?,recurring_id=? WHERE id=?',[goal.id,credit.id,recurring.id,t.id]);
    });
    return {category:c.id,transaction:t.id};
  });
  await waitSync(pa);await login(pb);await waitSync(pb);
  await poll(pb,async id=>{const {getPowerSync}=await import('/src/sync/database.ts');return (await getPowerSync().getAll('SELECT amount FROM transactions WHERE id=?',[id]))[0]?.amount===12345;},ids.transaction,{timeout:60000});
  console.log('PASS: device A → cloud → fresh device B preserves transaction ID and amount');
  await pb.locator('a[href="/transactions"]').click();
  await a.setOffline(true);
  await pa.evaluate(async id=>{const {getPowerSync}=await import('/src/sync/database.ts');await getPowerSync().execute('UPDATE transactions SET amount=?,note=? WHERE id=?',[54321,'Offline A edit',id]);},ids.transaction);
  await a.setOffline(false);
  await pa.getByRole('button',{name:'Retry sync'}).click();
  await waitSync(pa);
  await poll(pb,async id=>{const {getPowerSync}=await import('/src/sync/database.ts');return (await getPowerSync().getAll('SELECT amount FROM transactions WHERE id=?',[id]))[0]?.amount===54321;},ids.transaction,{timeout:60000});
  await pb.getByText('Offline A edit', {exact:true}).waitFor();
  console.log('PASS: offline changes upload and refresh the other client screen without a reload');
  await pb.evaluate(async id=>{const {getPowerSync}=await import('/src/sync/database.ts');await getPowerSync().execute('UPDATE transactions SET note=? WHERE id=?',['Device B edit',id]);},ids.transaction);
  await waitSync(pb);
  await poll(pa,async id=>{const {getPowerSync}=await import('/src/sync/database.ts');return (await getPowerSync().getAll('SELECT note FROM transactions WHERE id=?',[id]))[0]?.note==='Device B edit';},ids.transaction,{timeout:60000});
  console.log('PASS: device B → cloud → device A');
  await waitSync(pa); await waitSync(pb);
  await expect.poll(async()=>JSON.stringify((await snapshot(pa)).tables)===JSON.stringify((await snapshot(pb)).tables), {timeout:60000}).toBe(true);
  const original=await snapshot(pa);const other=await snapshot(pb);
  console.log('Snapshot row counts', Object.fromEntries(Object.keys(original.tables).map(t=>[t,[original.tables[t].length,other.tables[t].length]])));
  assert.deepEqual(other.tables,original.tables);
  await pa.goto(base+'/settings');
  const downloadEvent=pa.waitForEvent('download');
  await pa.getByRole('button',{name:'Export backup',exact:true}).click();
  const download=await downloadEvent;const file=resolve(directory,'backup.json');await download.saveAs(file);
  assert.deepEqual(JSON.parse(readFileSync(file,'utf8')).tables,original.tables);
  const c=await browser.newContext();await c.addInitScript(value=>{window.ROOT=value;},root);
  await c.route('**.powersync.journeyapps.com/**',route=>route.abort());
  await c.route('**/rest/v1/rpc/apply_sync_batch',route=>route.abort());
  const pc=await c.newPage();await login(pc);await pc.goto(base+'/settings');
  await pc.locator('input[type=file]').setInputFiles(file);
  await pc.getByRole('button',{name:'Confirm merge'}).click();
  await pc.getByText(/records imported/).waitFor();
  assert.deepEqual((await snapshot(pc)).tables,original.tables);
  console.log('PASS: file export → fresh device import while PowerSync is unreachable');
  await pc.locator('input[type=file]').setInputFiles(file);
  await pc.getByRole('button',{name:'Confirm merge'}).click();
  await pc.getByText(/0 records imported/).waitFor();
  await pc.reload();
  await pc.getByRole('button',{name:'Export backup',exact:true}).waitFor();
  assert.deepEqual((await snapshot(pc)).tables,original.tables);
  console.log('PASS: repeated import is idempotent; reload preserves offline data and login');
  await pb.evaluate(async id=>{const {getPowerSync}=await import('/src/sync/database.ts');await getPowerSync().execute('UPDATE transactions SET note=? WHERE id=?',['Newer cloud value',id]);},ids.transaction);
  await waitSync(pb);
  await c.unroute('**.powersync.journeyapps.com/**');
  await c.unroute('**/rest/v1/rpc/apply_sync_batch');
  await pc.getByRole('button',{name:'Retry sync'}).click();
  await poll(pc,async()=>{const {getPowerSync}=await import('/src/sync/database.ts');return (await getPowerSync().getAll('SELECT id FROM f1_conflicts')).length===1;});
  await pc.getByText('Review cloud conflict',{exact:true}).click();
  await pc.getByRole('button',{name:'Use backup value',exact:true}).click();
  await waitSync(pc);
  await poll(pb,async id=>{const {getPowerSync}=await import('/src/sync/database.ts');return (await getPowerSync().getAll('SELECT note FROM transactions WHERE id=?',[id]))[0]?.note==='Device B edit';},ids.transaction);
  console.log('PASS: offline import preserves unseen cloud conflicts until an explicit resolution');
  await pc.evaluate(async id=>{const {getPowerSync}=await import('/src/sync/database.ts');await getPowerSync().execute('UPDATE transactions SET category_id=? WHERE id=?',[crypto.randomUUID(),id]);},ids.transaction);
  await poll(pc,async()=>{const {getPowerSync}=await import('/src/sync/database.ts');return (await getPowerSync().getAll('SELECT op_id FROM f1_upload_failures')).length>0;});
  await pc.evaluate(async ids=>{const {getPowerSync}=await import('/src/sync/database.ts');await getPowerSync().execute('UPDATE transactions SET category_id=? WHERE id=?',[ids.category,ids.transaction]);},ids);
  const rejected=pc.locator('details').filter({has:pc.getByText('Review rejected upload',{exact:true})});
  await rejected.locator('summary').click();
  await expect(rejected.locator('pre').last()).toContainText(ids.category);
  await rejected.getByRole('button',{name:'Retry with current values',exact:true}).click();
  await waitSync(pc);
  await poll(pc,async()=>{const {getPowerSync}=await import('/src/sync/database.ts');const db=getPowerSync();return (await db.getAll('SELECT op_id FROM f1_upload_failures')).length===0 && (await db.getAll('SELECT op_id FROM f1_upload_repairs')).length===1;});
  console.log('PASS: rejected upload can be corrected and retried without losing its original values');
  await b.route('**/rest/v1/rpc/apply_sync_batch',route=>route.abort());
  await pb.evaluate(async id=>{const {getPowerSync}=await import('/src/sync/database.ts');await getPowerSync().execute('UPDATE transactions SET note=? WHERE id=?',['Pending across sign-out',id]);},ids.transaction);
  await pb.goto(base+'/settings');
  pb.once('dialog',dialog=>dialog.accept());
  await pb.getByRole('button',{name:'Sign out',exact:true}).click();
  await pb.getByLabel('Username').waitFor();
  await b.route('**.powersync.journeyapps.com/**',route=>route.abort());
  await login(pb);
  await poll(pb,async id=>{const {getPowerSync}=await import('/src/sync/database.ts');return (await getPowerSync().getAll('SELECT id FROM transactions WHERE id=?',[id])).length===1;},ids.transaction);
  await pb.reload();
  await pb.getByRole('button',{name:'Retry sync'}).waitFor();
  await poll(pb,async id=>{const {getPowerSync}=await import('/src/sync/database.ts');const db=getPowerSync();return (await db.getUploadQueueStats()).count>0 && (await db.getAll('SELECT note FROM transactions WHERE id=?',[id]))[0]?.note==='Pending across sign-out';},ids.transaction);
  await b.unroute('**/rest/v1/rpc/apply_sync_batch');await b.unroute('**.powersync.journeyapps.com/**');
  await pb.getByRole('button',{name:'Retry sync'}).click();await waitSync(pb);
  await poll(pa,async id=>{const {getPowerSync}=await import('/src/sync/database.ts');return (await getPowerSync().getAll('SELECT note FROM transactions WHERE id=?',[id]))[0]?.note==='Pending across sign-out';},ids.transaction);
  console.log('PASS: pending changes survive sign-out and restart, then upload after reconnecting');
  await c.route('**.supabase.co/**',route=>route.abort());
  await c.route('**.powersync.journeyapps.com/**',route=>route.abort());
  await pc.evaluate(()=>{const key=Object.keys(localStorage).find(k=>k.startsWith('sb-')&&k.endsWith('-auth-token'));const session=JSON.parse(localStorage.getItem(key));session.expires_at=1;localStorage.setItem(key,JSON.stringify(session));});
  await pc.reload();
  await pc.getByRole('button',{name:'Export backup',exact:true}).waitFor({timeout:15000});
  await poll(pc,async id=>{const {getPowerSync}=await import('/src/sync/database.ts');return (await getPowerSync().getAll('SELECT id FROM transactions WHERE id=?',[id])).length===1;},ids.transaction);
  console.log('PASS: expired authentication cannot block access to saved local data while offline');
  await pc.screenshot({path:resolve(root,'frontend/node_modules/.cache/f1nancer-tests/backup.png'),fullPage:true});
} catch(error) {
  if(browser) for(const context of browser.contexts()) for(const page of context.pages()) {
    const status=await page.locator('.sync-banner').innerText().catch(()=> 'No sync status'); console.error('Client status:',status); console.error('Recent sync events:',await page.evaluate(()=>window.syncEvents?.slice(-8))); console.error('Conflict count:',await page.evaluate(async()=>{try { const {getPowerSync}=await import('/src/sync/database.ts'); return (await getPowerSync().getAll('SELECT count(*) AS count FROM f1_conflicts'))[0]?.count; } catch { return 'unavailable'; }})); 
  }
  console.error('Failure location:', String(error.stack).split('\n').slice(-7).join('\n'));
  throw new Error(error instanceof assert.AssertionError ? 'Cloud test snapshot mismatch; see row counts and location above' : error.message);
} finally {
  await browser?.close();
  if(userId) {
    const cleanup=resolve(directory,'cleanup.sql');
    writeFileSync(cleanup,`DELETE FROM auth.users WHERE id='${userId}'::uuid AND email='${username}@users.f1nancer.local';\n`,{mode:0o600});
    execFileSync('supabase',['db','query','--linked','--file',cleanup,'--output-format','json'],{cwd:root,stdio:['ignore','ignore','pipe']});
    console.log('Disposable test account removed.');
  }
  rmSync(directory,{recursive:true,force:true});
}
