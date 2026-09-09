import { Pressable, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { useBackup } from '../data/useBackup';
import { isTemporaryStorage } from '../sync/database';
import { colors } from './theme';
async function share(payload: string) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('File sharing is unavailable on this device.');
  const uri = FileSystem.cacheDirectory + `F1nancer-backup-${Date.now()}.json`;
  await FileSystem.writeAsStringAsync(uri, payload);
  try { await Sharing.shareAsync(uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Save or transfer backup' }); }
  finally { await FileSystem.deleteAsync(uri, { idempotent: true }); }
}
export function BackupCard() {
  const s = useBackup();
  const button = (title: string, action: () => Promise<void>) => <Pressable accessibilityRole="button" disabled={s.busy} onPress={() => void s.run(action)} style={{ backgroundColor: colors.accent, padding: 12, borderRadius: 8, opacity: s.busy ? 0.5 : 1 }}><Text style={{ color: '#fff' }}>{title}</Text></Pressable>;
  return <View style={{ gap: 12 }}>
    <Text style={{ fontWeight: '700', fontSize: 20 }}>Backup &amp; transfer</Text>
    <Text>Export a file and import it on another device signed into the same account. Files contain readable financial data. A device still downloading may export an incomplete copy.</Text>
    {isTemporaryStorage && <Text style={{ color: colors.danger }}>Expo Go uses temporary memory. Export before closing. Install the Android app for persistent offline storage.</Text>}
    {button('Export backup', async () => share(JSON.stringify(await s.snapshot(), null, 2)))}
    {button('Import backup', async () => {
      const file = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', 'application/octet-stream'], copyToCacheDirectory: true });
      if (file.canceled) return;
      const asset = file.assets[0];
      if ((asset.size ?? 0) > 50 * 1024 * 1024) throw new Error('Backup exceeds 50 MB.');
      try { await s.stage(await FileSystem.readAsStringAsync(asset.uri)); }
      finally { await FileSystem.deleteAsync(asset.uri, { idempotent: true }); }
    })}
    {!!s.message && <Text accessibilityRole="alert">{s.message}</Text>}
    {s.backup && <View style={{ gap: 12 }}>
      <Text>Review import: {s.items.filter(i => i.kind === 'add').length} additions, {s.items.filter(i => i.kind === 'same').length} unchanged, {s.items.filter(i => i.kind === 'conflict').length} conflicts.</Text>
      <Text>Keep existing values by default. No records will be deleted. Cloud-only conflicts are checked when connected.</Text>
      {s.items.filter(i => i.kind === 'conflict').map(i => <View key={i.key} style={{ gap: 8 }}>
        <Text>{i.table}: {String(i.row.name ?? i.row.id)}</Text>
        <Text>Current: {JSON.stringify(i.existing)}</Text><Text>Backup: {JSON.stringify(i.row)}</Text>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: s.replaceKeys.has(i.key) }} onPress={() => s.toggle(i.key)}><Text>{s.replaceKeys.has(i.key) ? '☑' : '☐'} Use backup value</Text></Pressable>
      </View>)}
      {button('Confirm merge', s.apply)}<Pressable disabled={s.busy} onPress={s.cancel}><Text>Cancel</Text></Pressable>
    </View>}
    {s.conflicts.map(c => <View key={c.id} style={{ gap: 8 }}><Text>Cloud conflict</Text><Text>{JSON.stringify(JSON.parse(c.payload), null, 2)}</Text>{button('Keep cloud value', () => s.resolve(c, false))}{button('Use backup value', () => s.resolve(c, true))}</View>)}
    {s.uploadIssues.length > 0 && <Text>Correct rejected records in the app, then review and retry below. Original operations remain in local recovery history.</Text>}
    {s.uploadIssues.map(issue => <View key={issue.op_id} style={{gap:8}}><Text>{issue.error}</Text><Text>Original: {issue.original}</Text><Text>Current: {JSON.stringify(issue.current)}</Text>{issue.current && button('Retry with current values', () => s.repair(issue))}</View>)}
    {s.recovery.map(r => <View key={r.id}>{button(`Export recovery from ${new Date(r.created_at).toLocaleString()}`, () => share(r.payload))}</View>)}
  </View>;
}
