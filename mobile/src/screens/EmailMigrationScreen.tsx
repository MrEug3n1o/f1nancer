import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../sync/AuthProvider';
import { colors } from './theme';

export function EmailMigrationScreen() {
  const { requestEmailMigration, refreshEmailMigration, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send() {
    setBusy(true); setError(null);
    try { await requestEmailMigration(email); setSent(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not send verification email'); }
    finally { setBusy(false); }
  }
  async function refresh() {
    setBusy(true); setError(null);
    try { await refreshEmailMigration(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Email is not verified yet'); }
    finally { setBusy(false); }
  }
  return <KeyboardAvoidingView style={styles.shell} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.card}>
      <Text style={styles.title}>Add your real email</Text>
      <Text style={styles.muted}>Your old username and password worked. Verify a real email for future sign-ins and recovery.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!sent ? <>
        <TextInput style={styles.input} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="Email" value={email} onChangeText={setEmail} />
        <Pressable style={[styles.button, busy && styles.disabled]} disabled={busy} onPress={() => void send()}><Text style={styles.buttonText}>{busy ? 'Sending…' : 'Send verification link'}</Text></Pressable>
      </> : <>
        <Text style={styles.muted}>Open the link sent to {email}, then return here.</Text>
        <Pressable style={[styles.button, busy && styles.disabled]} disabled={busy} onPress={() => void refresh()}><Text style={styles.buttonText}>{busy ? 'Checking…' : 'I verified my email'}</Text></Pressable>
        <Pressable onPress={() => setSent(false)}><Text style={styles.link}>Use a different email</Text></Pressable>
      </>}
      <Pressable onPress={() => void signOut()}><Text style={styles.link}>Sign out</Text></Pressable>
    </View>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  shell: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.sidebar },
  card: { backgroundColor: colors.elevated, borderRadius: 14, padding: 22, gap: 14, borderWidth: 1, borderColor: colors.line },
  title: { fontSize: 26, fontWeight: '600', color: colors.ink, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  muted: { color: colors.muted, lineHeight: 20 }, error: { color: colors.danger },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 11, padding: 13, backgroundColor: colors.input, color: colors.ink },
  button: { backgroundColor: colors.accent, borderRadius: 11, padding: 14, alignItems: 'center' },
  disabled: { opacity: 0.5 }, buttonText: { color: '#fff', fontWeight: '600' },
  link: { color: colors.accent, textAlign: 'center' },
});
