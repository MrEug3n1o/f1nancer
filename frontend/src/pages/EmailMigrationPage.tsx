import { useState, type FormEvent } from 'react';
import { ErrorBanner } from '../components/ui';
import { useAuth } from '../sync/AuthProvider';

export function EmailMigrationPage() {
  const { requestEmailMigration, refreshEmailMigration, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
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

  return <div className="auth-shell"><div className="auth-card">
    <h1>Add your real email</h1>
    <p className="muted">Your old username and password were accepted. Verify a real email so future sign-ins and account recovery use Firebase securely.</p>
    <ErrorBanner message={error} />
    {!sent ? <form className="stack" onSubmit={submit}>
      <label>Email<input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} /></label>
      <button className="btn primary" disabled={busy}>{busy ? 'Sending…' : 'Send verification link'}</button>
    </form> : <div className="stack">
      <p>Open the verification link sent to <strong>{email}</strong>, then return here.</p>
      <button className="btn primary" type="button" disabled={busy} onClick={() => void refresh()}>{busy ? 'Checking…' : 'I verified my email'}</button>
      <button className="linkish" type="button" disabled={busy} onClick={() => setSent(false)}>Use a different email</button>
    </div>}
    <button className="linkish" type="button" onClick={() => void signOut()}>Sign out</button>
  </div></div>;
}
