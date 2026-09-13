import { useState, type FormEvent } from "react";
import { ErrorBanner } from "../components/ui";
import { isSyncConfigured } from "../sync/config";
import { useAuth } from "../sync/AuthProvider";

export function AuthPage() {
  const { signIn, signUp, configured } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") await signUp(identifier, password);
      else await signIn(identifier, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>{mode === "signup" ? "Create account" : "Sign in"}</h1>
        {!configured || !isSyncConfigured() ? (
          <ErrorBanner message="Firebase configuration is incomplete." />
        ) : null}
        <ErrorBanner message={error} />
        <form className="stack" onSubmit={onSubmit}>
          <label>
            {mode === "signup" ? "Email" : "Email or old username"}
            <input
              type={mode === "signup" ? "email" : "text"}
              autoComplete={mode === "signup" ? "email" : "username"}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              maxLength={254}
              spellCheck={false}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          <button className="btn primary" type="submit" disabled={busy || !configured}>
            {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>
        {mode === "signin" ? <p className="muted small">Existing account? Your old username and password still work once, then we’ll help you add a real email.</p> : <p className="muted small">We’ll send a verification link. Product or marketing email still requires separate consent.</p>}
        <p className="muted small">
          {mode === "signup" ? "Already have an account?" : "New here?"}{" "}
          <button
            type="button"
            className="linkish"
            onClick={() => {
              setMode(mode === "signup" ? "signin" : "signup");
              setError(null);
            }}
          >
            {mode === "signup" ? "Sign in" : "Create an account"}
          </button>
        </p>
      </div>
    </div>
  );
}
