import { useRef } from 'react';
import { useBackup } from '../data/useBackup';
import { prepareLegacyBackup } from '../data/importLocal';
import { useAuth } from '../sync/AuthProvider';

type DesktopFiles = { save_backup(payload: string): Promise<boolean>; open_backup(): Promise<string | null> };
function nativeFiles() { return (window as Window & { pywebview?: { api?: DesktopFiles } }).pywebview?.api; }
async function saveFile(payload: string) {
  const native = nativeFiles();
  if (native) { await native.save_backup(payload); return; }
  const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'F1nancer-backup.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function BackupPanel() {
  const state = useBackup(); const input = useRef<HTMLInputElement>(null); const { session } = useAuth();
  async function chooseFile() {
    const native = nativeFiles();
    if (native) await state.run(async () => { const text = await native.open_backup(); if (text !== null) await state.stage(text); });
    else input.current?.click();
  }
  return <section className="section">
    <h2>Data &amp; sync</h2>
    <p>Export your data here, transfer the file, then sign into the same account on your other device and import it. Files contain readable financial data. Local-only changes are included; a device still downloading may have an incomplete copy.</p>
    <p>Signing out keeps local data and pending changes.</p>
    <div className="form-actions">
      <button className="btn" disabled={state.busy} onClick={() => void state.run(async () => saveFile(JSON.stringify(await state.snapshot(), null, 2)))}>Export backup</button>
      <button className="btn" disabled={state.busy} onClick={() => void chooseFile()}>Import backup</button>
      <button className="btn" disabled={state.busy} onClick={() => void state.run(async () => state.stage(await prepareLegacyBackup(session!.user.id)))}>Preview previous desktop data</button>
    </div>
    <input ref={input} type="file" accept=".json,application/json" hidden onChange={e => {
      const file = e.target.files?.[0]; e.target.value = '';
      if (file) void state.run(async () => { if (file.size > 50 * 1024 * 1024) throw new Error('Backup exceeds 50 MB.'); await state.stage(await file.text()); });
    }} />
    {state.message && <p role="status">{state.message}</p>}
    {state.backup && <div>
      <h3>Review import</h3>
      <p>{state.items.filter(i => i.kind === 'add').length} additions · {state.items.filter(i => i.kind === 'same').length} unchanged · {state.items.filter(i => i.kind === 'conflict').length} conflicts</p>
      <p>Existing values are kept unless selected below. No records will be deleted. Cloud-only conflicts will be checked when connected.</p>
      {state.items.filter(i => i.kind === 'conflict').map(item => <details key={item.key}>
        <summary>{item.table}: {String(item.row.name ?? item.row.note ?? item.row.id)}</summary>
        <p>Current</p><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(item.existing, null, 2)}</pre>
        <p>Backup</p><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(item.row, null, 2)}</pre>
        <label><input type="checkbox" checked={state.replaceKeys.has(item.key)} onChange={() => state.toggle(item.key)} /> Use backup value</label>
      </details>)}
      <div className="form-actions"><button className="btn primary" disabled={state.busy} onClick={() => void state.run(state.apply)}>Confirm merge</button><button className="btn" disabled={state.busy} onClick={state.cancel}>Cancel</button></div>
    </div>}
    {state.conflicts.length > 0 && <h3>Cloud conflicts</h3>}
    {state.conflicts.map(conflict => <details key={conflict.id}><summary>Review cloud conflict</summary>
      <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(JSON.parse(conflict.payload), null, 2)}</pre>
      <button className="btn" disabled={state.busy} onClick={() => void state.run(() => state.resolve(conflict, false))}>Keep cloud value</button>
      <button className="btn" disabled={state.busy} onClick={() => void state.run(() => state.resolve(conflict, true))}>Use backup value</button>
    </details>)}
    {state.uploadIssues.length > 0 && <div><h3>Uploads needing correction</h3><p>Correct the record in the app, review the values below, then retry. The original operation is kept in local recovery history.</p>
      {state.uploadIssues.map(issue => <details key={issue.op_id}><summary>Review rejected upload</summary><p>{issue.error}</p>
        <p>Original operation</p><pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(JSON.parse(issue.original),null,2)}</pre>
        <p>Current local values</p><pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(issue.current,null,2)}</pre>
        {issue.current && <button className="btn" disabled={state.busy} onClick={() => void state.run(() => state.repair(issue))}>Retry with current values</button>}
      </details>)}
    </div>}
    {state.recovery.length > 0 && <details><summary>Recovery snapshots</summary>{state.recovery.map(r => <p key={r.id}>
      {new Date(r.created_at).toLocaleString()} <button className="btn" disabled={state.busy} onClick={() => void state.run(() => saveFile(r.payload))}>Export recovery</button>
    </p>)}</details>}
  </section>;
}
