import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../sync/AuthProvider';
import { colors } from './theme';

export function EmailVerificationScreen() {
  const { email, refreshEmailVerification, resendEmailVerification, signOut } = useAuth();
  const [busy, setBusy] = useState<'check' | 'resend' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('Open the verification link we sent, then return here.');

  async function check() {
    setBusy('check'); setError(null);
    try { await refreshEmailVerification(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Email is not verified yet.'); }
    finally { setBusy(null); }
  }

  async function resend() {
    setBusy('resend'); setError(null);
    try { await resendEmailVerification(); setMessage('A new verification link was sent.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not resend the verification email.'); }
    finally { setBusy(null); }
  }

  return <View style={styles.shell}><View style={styles.card}>
    <Text style={styles.title}>Verify your email</Text>
    <Text style={styles.muted}>Confirm {email} before storing financial data in this account.</Text>
    <Text style={styles.muted}>{message}</Text>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <Pressable style={[styles.button, busy !== null && styles.disabled]} disabled={busy !== null} onPress={() => void check()}>
      <Text style={styles.buttonText}>{busy === 'check' ? 'Checking…' : 'I verified my email'}</Text>
    </Pressable>
    <Pressable disabled={busy !== null} onPress={() => void resend()}><Text style={styles.link}>{busy === 'resend' ? 'Sending…' : 'Resend verification link'}</Text></Pressable>
    <Pressable disabled={busy !== null} onPress={() => void signOut()}><Text style={styles.link}>Sign out</Text></Pressable>
  </View></View>;
}

const styles = StyleSheet.create({
  shell: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.sidebar },
  card: { backgroundColor: colors.elevated, borderRadius: 14, padding: 22, gap: 14, borderWidth: 1, borderColor: colors.line },
  title: { fontSize: 26, fontWeight: '600', color: colors.ink },
  muted: { color: colors.muted, lineHeight: 20 },
  error: { color: colors.danger },
  button: { backgroundColor: colors.accent, borderRadius: 11, padding: 14, alignItems: 'center' },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '600' },
  link: { color: colors.accent, textAlign: 'center' },
});
