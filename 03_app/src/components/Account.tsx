import { useEffect, useRef, useState } from "react";
import { api, ApiError, postJson } from "../api";
import { TermsText, TERMS_VERSION, UPDATED } from "../legal";

// After Google, the page comes back fresh: this note says the terms were accepted just before leaving
export const PENDING_TERMS = "terms-accepted-before-google";
const remember = (key: string, value: string) => { try { sessionStorage.setItem(key, value); } catch { /* private window */ } };

const message = (err: unknown) =>
  err instanceof ApiError ? err.message : "Could not reach the app. Check your connection.";

// The second lock: your own account, by email and password or with Google
export function AccountScreen({ google, onSignedIn }: { google: boolean; onSignedIn: () => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [terms, setTerms] = useState<"email" | "google" | null>(null);
  const form = useRef<HTMLFormElement>(null);

  const field = (name: string) => String(new FormData(form.current!).get(name) || "");

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  const signIn = () => run(async () => {
    await postJson("/api/auth/sign-in/email", { email: field("email"), password: field("password") });
    onSignedIn();
  });

  // the terms were accepted in the window: create the account, then keep the acceptance
  const signUp = () => run(async () => {
    await postJson("/api/auth/sign-up/email", { name: field("name"), email: field("email"), password: field("password") });
    await api("/api/terms/accept", { method: "POST" });
    onSignedIn();
  });

  const continueWithGoogle = () => run(async () => {
    remember(PENDING_TERMS, TERMS_VERSION);
    const { url } = await postJson<{ url: string }>("/api/auth/sign-in/social", { provider: "google", callbackURL: "/" });
    window.location.href = url;
  });

  return (
    <main className="login account">
      <form
        ref={form}
        className="sheet"
        onSubmit={(event) => {
          event.preventDefault();
          if (mode === "signin") signIn();
          else setTerms("email");
        }}
      >
        <h1>{mode === "signin" ? "Sign in" : "Create your account"}</h1>
        <p className="muted">
          {mode === "signin" ? "Your saved searches belong to your account: only you see them." : "One account per person. Your searches stay yours."}
        </p>

        {google && (
          <>
            <button type="button" className="quiet google" disabled={busy} onClick={() => setTerms("google")}>
              <svg viewBox="0 0 18 18" aria-hidden="true">
                <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
                <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
              </svg>
              Continue with Google
            </button>
            <p className="or"><span>or with your email</span></p>
          </>
        )}

        {mode === "signup" && (
          <>
            <label htmlFor="name">Name</label>
            <input id="name" name="name" autoComplete="name" required />
          </>
        )}
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
        <label htmlFor="account-password">Password</label>
        <input id="account-password" name="password" type="password" minLength={mode === "signup" ? 10 : undefined} required
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          aria-describedby={mode === "signup" ? "password-rule" : undefined} />
        {mode === "signup" && <p id="password-rule" className="hint">At least 10 characters.</p>}

        <button type="submit" className="primary" disabled={busy}>
          {busy ? "One moment…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
        {error && <p className="status" data-tone="error" role="alert">{error}</p>}

        <p className="switch">
          {mode === "signin" ? "No account yet? " : "Already have an account? "}
          <button type="button" className="link" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }}>
            {mode === "signin" ? "Create one" : "Sign in"}
          </button>
        </p>
      </form>

      {terms && (
        <TermsDialog
          intro={terms === "google" ? "If this is your first time with Google here, continuing creates your account." : "Read and accept the terms to create your account."}
          acceptLabel={terms === "google" ? "Accept and continue with Google" : "Accept and create account"}
          onAccept={() => { const how = terms; setTerms(null); if (how === "google") continueWithGoogle(); else signUp(); }}
          onCancel={() => setTerms(null)}
          cancelLabel="Cancel"
        />
      )}
    </main>
  );
}

// The terms pop up at sign-up: nothing is created until you tick "I agree" and accept
export function TermsDialog({ intro, acceptLabel, cancelLabel, onAccept, onCancel }: {
  intro: string;
  acceptLabel: string;
  cancelLabel: string;
  onAccept: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [agreed, setAgreed] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog ref={dialog} className="terms-dialog" aria-labelledby="terms-title" onCancel={(event) => { event.preventDefault(); onCancel(); }}>
      <h2 id="terms-title">Terms and conditions</h2>
      <p className="muted">{intro} Last updated {UPDATED}.</p>
      <div className="terms-scroll" tabIndex={0} aria-label="The terms and conditions">
        <TermsText />
      </div>
      <label className="agree">
        <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
        <span>I have read and agree to the terms and conditions and the <a href="/privacy" target="_blank" rel="noreferrer">privacy policy</a>.</span>
      </label>
      <div className="dialog-actions">
        <button type="button" className="quiet" onClick={onCancel}>{cancelLabel}</button>
        <button type="button" className="primary" disabled={!agreed} onClick={onAccept}>{acceptLabel}</button>
      </div>
    </dialog>
  );
}

// "Delete my account": everything of yours goes, in D1 and R2, after one clear confirmation
export function DeleteAccount({ onDeleted }: { onDeleted: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/account/delete", { method: "POST" });
      dialog.current?.close();
      onDeleted();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="link" onClick={() => dialog.current?.showModal()}>Delete my account</button>
      <dialog ref={dialog} className="terms-dialog small" aria-labelledby="delete-title">
        <h2 id="delete-title">Delete your account?</h2>
        <p>
          This deletes your account, your sessions, all your saved searches, the plans you uploaded and their results.
          It cannot be undone.
        </p>
        {error && <p className="status" data-tone="error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="quiet" onClick={() => dialog.current?.close()}>Keep my account</button>
          <button type="button" className="primary danger" disabled={busy} onClick={remove}>{busy ? "Deleting…" : "Delete everything"}</button>
        </div>
      </dialog>
    </>
  );
}
