import { useCallback, useEffect, useState } from 'react';
import { readUploadIssues, repairUpload, type UploadIssue, exportBackup, importBackup, parseBackup, previewBackup, resolveBackupConflict, type FinanceBackup, type BackupConflict } from '@f1nancer/domain';
import { useAuth } from '../sync/AuthProvider';
import { getPowerSync } from '../sync/database';
import { supabaseUrl } from '../sync/config';
import { randomUUID } from "expo-crypto";
export function useBackup() {
  const { session, syncInfo, syncError, dataRevision, retrySync } = useAuth();
  const userId = session!.user.id;
  const db = getPowerSync();
  const [backup, setBackup] = useState<FinanceBackup | null>(null);
  const [current, setCurrent] = useState<FinanceBackup | null>(null);
  const [replaceKeys, setReplaceKeys] = useState(new Set<string>());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [conflicts, setConflicts] = useState<BackupConflict[]>([]);
  const [uploadIssues, setUploadIssues] = useState<UploadIssue[]>([]);
  const [recovery, setRecovery] = useState<{ id: string; payload: string; created_at: string }[]>([]);
  const refresh = useCallback(async () => {
    setUploadIssues(await readUploadIssues(db, userId));
    setConflicts(await db.getAll<BackupConflict>('SELECT id, payload FROM f1_conflicts ORDER BY id'));
    setRecovery(await db.getAll<{ id: string; payload: string; created_at: string }>('SELECT id, payload, created_at FROM f1_recovery ORDER BY created_at DESC LIMIT 10'));
  }, [db, userId]);
  useEffect(() => { void refresh().catch(e => setMessage(String(e))); }, [refresh, syncInfo.conflicts, syncError?.message, dataRevision]);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await action(); await refresh(); } catch (e) { setMessage(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  const snapshot = () => exportBackup(db, userId, supabaseUrl, syncInfo);
  async function stage(value: string | FinanceBackup) {
    const next = typeof value === 'string' ? parseBackup(value, userId, supabaseUrl) : parseBackup(JSON.stringify(value), userId, supabaseUrl);
    setCurrent(await snapshot()); setBackup(next); setReplaceKeys(new Set());
  }
  async function apply() {
    if (!backup || !current) return;
    const count = await importBackup(db, backup, current, replaceKeys, randomUUID);
    setBackup(null); setCurrent(null);
    setMessage(`${count} records imported. A recovery snapshot was saved. Cloud comparisons are checked when uploads resume.`);
  }
  function toggle(key: string) { setReplaceKeys(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; }); }
  async function resolve(conflict: BackupConflict, useBackup: boolean) {
    await resolveBackupConflict(db, conflict, useBackup, userId);
    setMessage(useBackup ? 'Backup value queued for upload.' : 'Cloud value kept.');
  }
  async function repair(issue: UploadIssue) {
    await repairUpload(db, issue, userId, supabaseUrl);
    await retrySync();
    setMessage('Retrying with the reviewed current values. The original operation is retained in local recovery history.');
  }
  return { uploadIssues, repair, backup, current, items: backup && current ? previewBackup(backup, current) : [], replaceKeys, busy, message, conflicts, recovery,
    run, snapshot, stage, apply, toggle, resolve, cancel: () => { setBackup(null); setCurrent(null); } };
}
