import { useState } from 'react';
import { ErrorBanner } from '../components/ui';
import { useAuth } from '../sync/AuthProvider';

export function EmailVerificationPage() {
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

  return <div className="auth-shell"><div className="auth-card">
    <h1>Verify your email</h1>
    <p className="muted">Confirm <strong>{email}</strong> before storing financial data in this account.</p>
    <p>{message}</p>
    <ErrorBanner message={error} />
    <div className="stack">
      <button className="btn primary" type="button" disabled={busy !== null} onClick={() => void check()}>
        {busy === 'check' ? 'Checking…' : 'I verified my email'}
      </button>
      <button className="linkish" type="button" disabled={busy !== null} onClick={() => void resend()}>
        {busy === 'resend' ? 'Sending…' : 'Resend verification link'}
      </button>
      <button className="linkish" type="button" disabled={busy !== null} onClick={() => void signOut()}>Sign out</button>
    </div>
  </div></div>;
}
