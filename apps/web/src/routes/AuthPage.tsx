import { FormEvent, useState } from 'react';
import type { SessionUser } from '@potion/shared';
import LoadingOverlay from '../components/LoadingOverlay';
import { PhoneNumberInput, createPhoneMask, getPhoneDigits, getStoredPhoneNumber } from '../components/PhoneNumberInput';
import { createAccount, loginUser, verifyAccount } from '../lib/api';

type AuthMode = 'sign-in' | 'create' | 'verify';

type AuthPageProps = {
  onSession: (token: string, user: SessionUser) => void;
};

export default function AuthPage({ onSession }: AuthPageProps) {
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState(createPhoneMask(''));
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('Sign in or create an account to view purchases.');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSignIn(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage('Signing in');

    try {
      const result = await loginUser({ email, password });
      onSession(result.token, result.user);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sign-in failed.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCreateAccount(event: FormEvent) {
    event.preventDefault();
    const digits = getPhoneDigits(phoneNumber);
    const nextPhoneNumber = getStoredPhoneNumber(phoneNumber);

    if (digits.length > 0 && digits.length !== 10) {
      setMessage('Enter a 10-digit phone number.');
      return;
    }

    setIsSubmitting(true);
    setMessage('Creating account');

    try {
      const result = await createAccount({ email, displayName, password, phoneNumber: nextPhoneNumber || undefined });
      setEmail(result.email);
      setMode('verify');
      setMessage('Enter the code sent to your email. If this environment uses the local outbox, open it to view the message.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Account creation failed.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerify(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage('Verifying code');

    try {
      const result = await verifyAccount({ email, code });
      onSession(result.token, result.user);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Verification failed.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
    <section className="content-panel auth-panel">
      <div>
        <p className="eyebrow">Account</p>
        <h1>{mode === 'create' ? 'Create Account' : mode === 'verify' ? 'Verify Email' : 'Sign In'}</h1>
        <p className="status-text">{message}</p>
      </div>
      <div className="segmented-control" aria-label="Account mode">
        <button className={mode === 'sign-in' ? 'active' : ''} type="button" onClick={() => setMode('sign-in')}>
          Sign In
        </button>
        <button className={mode === 'create' ? 'active' : ''} type="button" onClick={() => setMode('create')}>
          Create Account
        </button>
      </div>
      {mode === 'sign-in' ? (
        <form className="stack-form" onSubmit={handleSignIn}>
          <label>
            Email
            <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Password
            <input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <button type="submit" disabled={isSubmitting}>
            Sign In
          </button>
        </form>
      ) : null}
      {mode === 'create' ? (
        <form className="stack-form" onSubmit={handleCreateAccount}>
          <label>
            Name
            <input required value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </label>
          <PhoneNumberInput label="Phone Number (Optional)" value={phoneNumber} onChange={setPhoneNumber} />
          <label>
            Email
            <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Password
            <input type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <button type="submit" disabled={isSubmitting}>
            Send Verification Code
          </button>
        </form>
      ) : null}
      {mode === 'verify' ? (
        <form className="stack-form" onSubmit={handleVerify}>
          <label>
            Email
            <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Verification code
            <input inputMode="numeric" pattern="[0-9]{6}" required value={code} onChange={(event) => setCode(event.target.value)} />
          </label>
          <button type="submit" disabled={isSubmitting}>
            Verify Account
          </button>
        </form>
      ) : null}
    </section>
    {isSubmitting ? <LoadingOverlay label={message} detail="Please wait while we complete your request." variant="auth" /> : null}
    </>
  );
}