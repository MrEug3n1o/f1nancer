import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../sync/AuthProvider';
import { colors } from './theme';

function migrationErrorMessage(reason: unknown): { message: string; requiresSignIn: boolean } {
  const code = reason && typeof reason === 'object' ? (reason as { code?: unknown }).code : null;
  const text = reason instanceof Error ? reason.message : String(reason ?? '');
  if (code === 'auth/requires-recent-login' || text.includes('auth/requires-recent-login')) {
    return {
      message: 'For security, Firebase needs a fresh sign-in before changing your email. Sign in again, then send the verification link.',
      requiresSignIn: true,
    };
  }
  return {
    message: reason instanceof Error ? reason.message : 'Could not send verification email',
    requiresSignIn: false,
  };
}

export function EmailMigrationScreen() {
  const { requestEmailMigration, refreshEmailMigration, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState<'send' | 'check' | 'resend' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requiresSignIn, setRequiresSignIn] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function send() {
    setBusy('send'); setError(null); setRequiresSignIn(false); setMessage(null);
    try { await requestEmailMigration(email); setSent(true); }
    catch (reason) { const next = migrationErrorMessage(reason); setError(next.message); setRequiresSignIn(next.requiresSignIn); }
    finally { setBusy(null); }
  }
  async function refresh() {
    setBusy('check'); setError(null); setRequiresSignIn(false);
    try { await refreshEmailMigration(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Email is not verified yet'); }
    finally { setBusy(null); }
  }
  async function resend() {
    setBusy('resend'); setError(null); setRequiresSignIn(false); setMessage(null);
    try { await requestEmailMigration(email); setMessage('A new verification link was sent.'); }
    catch (reason) { const next = migrationErrorMessage(reason); setError(next.message); setRequiresSignIn(next.requiresSignIn); }
    finally { setBusy(null); }
  }
  return <KeyboardAvoidingView style={styles.shell} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.card}>
      <Text style={styles.title}>Add your real email</Text>
      <Text style={styles.muted}>This account still uses a legacy sign-in address. Verify a real email for future sign-ins and recovery.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {requiresSignIn ? <Pressable style={[styles.button, busy !== null && styles.disabled]} disabled={busy !== null} onPress={() => void signOut()}><Text style={styles.buttonText}>Sign in again</Text></Pressable> : null}
      {!sent ? <>
        <TextInput style={styles.input} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="Email" value={email} onChangeText={setEmail} />
        <Pressable style={[styles.button, busy !== null && styles.disabled]} disabled={busy !== null} onPress={() => void send()}><Text style={styles.buttonText}>{busy === 'send' ? 'Sending…' : 'Send verification link'}</Text></Pressable>
      </> : <>
        <Text style={styles.muted}>Open the link sent to {email}, then return here.</Text>
        {message ? <Text style={styles.muted}>{message}</Text> : null}
        <Pressable style={[styles.button, busy !== null && styles.disabled]} disabled={busy !== null} onPress={() => void refresh()}><Text style={styles.buttonText}>{busy === 'check' ? 'Checking…' : 'I verified my email'}</Text></Pressable>
        <Pressable disabled={busy !== null} onPress={() => void resend()}><Text style={styles.link}>{busy === 'resend' ? 'Sending…' : 'Resend verification link'}</Text></Pressable>
        <Pressable disabled={busy !== null} onPress={() => { setSent(false); setMessage(null); }}><Text style={styles.link}>Use a different email</Text></Pressable>
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
