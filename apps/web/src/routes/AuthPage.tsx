import { FormEvent, useState } from 'react';
import type { SessionUser } from '@potion/shared';
import ButtonArrowIcon from '../components/ButtonArrowIcon';
import LoadingOverlay from '../components/LoadingOverlay';
import { PhoneNumberInput, createPhoneMask, getPhoneDigits, getStoredPhoneNumber } from '../components/PhoneNumberInput';
import { confirmPasswordReset, createAccount, loginUser, requestPasswordReset, verifyAccount } from '../lib/api';

type AuthMode = 'sign-in' | 'create' | 'verify' | 'forgot' | 'reset';

type AuthPageProps = {
  onSession: (token: string, user: SessionUser) => void;
};

export default function AuthPage({ onSession }: AuthPageProps) {
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('');
  const [phoneNumber, setPhoneNumber] = useState(createPhoneMask(''));
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function selectMode(nextMode: AuthMode) {
    setMode(nextMode);
    setMessage('');
  }

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

  async function handleRequestPasswordReset(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage('Sending reset code');

    try {
      const result = await requestPasswordReset({ email });
      setEmail(result.email);
      setCode('');
      setResetPassword('');
      setResetPasswordConfirm('');
      setMode('reset');
      setMessage('Enter the reset code sent to your email. If this environment uses the local outbox, open it to view the message.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not send reset code.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResetPassword(event: FormEvent) {
    event.preventDefault();

    if (resetPassword.length < 8) {
      setMessage('New password must be at least 8 characters.');
      return;
    }

    if (resetPassword !== resetPasswordConfirm) {
      setMessage('New passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    setMessage('Resetting password');

    try {
      await confirmPasswordReset({ email, code, newPassword: resetPassword });
      setPassword('');
      setResetPassword('');
      setResetPasswordConfirm('');
      setCode('');
      setMode('sign-in');
      setMessage('Password reset. Sign in with your new password.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Password reset failed.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
    <section className="content-panel auth-panel">
      <div className="segmented-control auth-mode-switch" aria-label="Account mode">
        <button className={mode === 'sign-in' || mode === 'forgot' || mode === 'reset' ? 'active' : ''} type="button" onClick={() => selectMode('sign-in')}>
          Sign In
        </button>
        <button className={mode === 'create' || mode === 'verify' ? 'active' : ''} type="button" onClick={() => selectMode('create')}>
          Create Account
        </button>
      </div>
      {message ? <p className="status-text auth-status-text">{message}</p> : null}
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
          <button className="button-with-arrow" type="submit" disabled={isSubmitting}>
            <span>Sign In</span>
            <ButtonArrowIcon />
          </button>
          <button className="text-button" type="button" disabled={isSubmitting} onClick={() => {
            setMode('forgot');
            setMessage('Enter your account email and we will send a reset code.');
          }}>
            Forgot password?
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
      {mode === 'forgot' ? (
        <form className="stack-form" onSubmit={handleRequestPasswordReset}>
          <label>
            Email
            <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <button type="submit" disabled={isSubmitting}>
            Send Reset Code
          </button>
          <button className="text-button" type="button" disabled={isSubmitting} onClick={() => setMode('sign-in')}>
            Back to Sign In
          </button>
        </form>
      ) : null}
      {mode === 'reset' ? (
        <form className="stack-form" onSubmit={handleResetPassword}>
          <label>
            Email
            <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Reset code
            <input inputMode="numeric" pattern="[0-9]{6}" required value={code} onChange={(event) => setCode(event.target.value)} />
          </label>
          <label>
            New Password
            <input type="password" required minLength={8} value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} />
          </label>
          <label>
            Confirm New Password
            <input type="password" required minLength={8} value={resetPasswordConfirm} onChange={(event) => setResetPasswordConfirm(event.target.value)} />
          </label>
          <button type="submit" disabled={isSubmitting}>
            Reset Password
          </button>
          <button className="text-button" type="button" disabled={isSubmitting} onClick={() => setMode('forgot')}>
            Send Another Code
          </button>
        </form>
      ) : null}
    </section>
    {isSubmitting ? <LoadingOverlay label={message} detail="Please wait while we complete your request." variant="auth" /> : null}
    </>
  );
}