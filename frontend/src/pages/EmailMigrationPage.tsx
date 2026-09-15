import { useState, type FormEvent } from 'react';
import { ErrorBanner } from '../components/ui';
import { useAuth } from '../sync/AuthProvider';

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

export function EmailMigrationPage() {
  const { requestEmailMigration, refreshEmailMigration, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState<'send' | 'check' | 'resend' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requiresSignIn, setRequiresSignIn] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy('send'); setError(null); setRequiresSignIn(false); setMessage(null);
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

  return <div className="auth-shell"><div className="auth-card">
    <h1>Add your real email</h1>
    <p className="muted">This account still uses a legacy sign-in address. Verify a real email so future sign-ins and account recovery use Firebase securely.</p>
    <ErrorBanner message={error} />
    {requiresSignIn ? <button className="btn primary" type="button" disabled={busy !== null} onClick={() => void signOut()}>Sign in again</button> : null}
    {!sent ? <form className="stack" onSubmit={submit}>
      <label>Email<input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} /></label>
      <button className="btn primary" disabled={busy !== null}>{busy === 'send' ? 'Sending…' : 'Send verification link'}</button>
    </form> : <div className="stack">
      <p>Open the verification link sent to <strong>{email}</strong>, then return here.</p>
      {message ? <p className="muted">{message}</p> : null}
      <button className="btn primary" type="button" disabled={busy !== null} onClick={() => void refresh()}>{busy === 'check' ? 'Checking…' : 'I verified my email'}</button>
      <button className="linkish" type="button" disabled={busy !== null} onClick={() => void resend()}>{busy === 'resend' ? 'Sending…' : 'Resend verification link'}</button>
      <button className="linkish" type="button" disabled={busy !== null} onClick={() => { setSent(false); setMessage(null); }}>Use a different email</button>
    </div>}
    <button className="linkish" type="button" onClick={() => void signOut()}>Sign out</button>
  </div></div>;
}
