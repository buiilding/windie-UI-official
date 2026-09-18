/** Presentation-only account gate; OAuth and session state stay in useHostedAuth. */
import type { ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth-screen">
      <header className="auth-header">
        <span className="auth-wordmark">
          Windie<span aria-hidden="true">.</span>
        </span>
      </header>
      <div className="auth-center">{children}</div>
      <footer className="auth-footer">
        A little space for your next big idea.
      </footer>
    </main>
  );
}

/** Decorative provider mark; the button's visible text supplies its accessible name. */
function GoogleMark() {
  return (
    <svg
      className="auth-google-mark"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.61 4.61 0 0 1-1.99 3.02v2.51h3.23c1.89-1.74 2.98-4.3 2.98-7.36Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.23-2.51c-.89.6-2.03.96-3.39.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.41 13.92a6 6 0 0 1 0-3.84V7.49H3.07a10 10 0 0 0 0 9.02l3.34-2.59Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.96c1.47 0 2.79.51 3.83 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.49l3.34 2.59C7.2 7.72 9.4 5.96 12 5.96Z"
      />
    </svg>
  );
}

export function SignInPanel({
  signingIn,
  error,
  onSignIn,
}: {
  signingIn: boolean;
  error: string | null;
  onSignIn: () => void;
}) {
  return (
    <AuthLayout>
      <section className="auth-content" aria-labelledby="sign-in-heading">
        <p className="auth-eyebrow">
          <span aria-hidden="true" /> AI that controls computers
        </p>
        <h1 id="sign-in-heading">Welcome to Windie.</h1>
        <p className="auth-description">
          Tell Windie what you need.
          <br />
          Let it take care of the clicks.
        </p>
        <button
          type="button"
          className="auth-google-button"
          onClick={onSignIn}
          disabled={signingIn}
          aria-busy={signingIn}
        >
          {signingIn ? (
            <LoaderCircle className="spin" aria-hidden="true" />
          ) : (
            <GoogleMark />
          )}
          <span>{signingIn ? 'Opening Google…' : 'Continue with Google'}</span>
        </button>
        <p className="auth-caption">
          Your conversations, together in one place.
        </p>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </AuthLayout>
  );
}
