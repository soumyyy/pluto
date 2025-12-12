'use client';

interface GoogleSignInButtonProps {
  onClick: () => void;
  loading?: boolean;
}

export function GoogleSignInButton({ onClick, loading }: GoogleSignInButtonProps) {
  return (
    <button className="google-signin-btn" onClick={onClick} disabled={loading}>
      <span className="google-icon" aria-hidden="true">
        G
      </span>
      {loading ? 'Connecting to Google…' : 'Continue with Google'}
    </button>
  );
}
