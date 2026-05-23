import { FormEvent, TouchEvent, useEffect, useRef, useState } from 'react';
import type { SessionUser } from '@potion/shared';
import ButtonArrowIcon from '../components/ButtonArrowIcon';
import LoadingOverlay from '../components/LoadingOverlay';
import { PhoneNumberInput, createPhoneMask, getPhoneDigits, getStoredPhoneNumber } from '../components/PhoneNumberInput';
import { confirmPasswordReset, createAccount, loginUser, requestPasswordReset, verifyAccount } from '../lib/api';

type AuthMode = 'sign-in' | 'create' | 'verify' | 'forgot' | 'reset';

type AuthPageProps = {
  onSession: (token: string, user: SessionUser) => void;
  initialMode?: Extract<AuthMode, 'sign-in' | 'create'>;
};

function getFormValue(form: HTMLFormElement, fieldName: string) {
  const value = new FormData(form).get(fieldName);

  return typeof value === 'string' ? value : '';
}

function isExistingAccountError(message: string) {
  const normalizedMessage = message.trim().toLowerCase();

  return normalizedMessage.includes('account already exists') && normalizedMessage.includes('email');
}

export default function AuthPage({ onSession, initialMode = 'sign-in' }: AuthPageProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('');
  const [phoneNumber, setPhoneNumber] = useState(createPhoneMask(''));
  const [eventReminderOptIn, setEventReminderOptIn] = useState(true);
  const [upcomingEventsOptIn, setUpcomingEventsOptIn] = useState(true);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [toastVersion, setToastVersion] = useState(0);
  const [isToastClosing, setIsToastClosing] = useState(false);
  const [hasEmailConflict, setHasEmailConflict] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const toastDismissTimeoutRef = useRef<number | null>(null);
  const toastCloseTimeoutRef = useRef<number | null>(null);
  const toastTouchStartYRef = useRef<number | null>(null);
  const isSubmittingRef = useRef(false);

  function clearToastTimers() {
    if (toastDismissTimeoutRef.current !== null) {
      window.clearTimeout(toastDismissTimeoutRef.current);
      toastDismissTimeoutRef.current = null;
    }

    if (toastCloseTimeoutRef.current !== null) {
      window.clearTimeout(toastCloseTimeoutRef.current);
      toastCloseTimeoutRef.current = null;
    }
  }

  function dismissToast() {
    if (!toastMessage || isToastClosing) {
      return;
    }

    clearToastTimers();
    setIsToastClosing(true);
    toastCloseTimeoutRef.current = window.setTimeout(() => {
      setToastMessage('');
      setIsToastClosing(false);
      toastCloseTimeoutRef.current = null;
    }, 220);
  }

  useEffect(() => {
    if (!toastMessage) {
      clearToastTimers();
      return undefined;
    }

    setIsToastClosing(false);
    clearToastTimers();
    toastDismissTimeoutRef.current = window.setTimeout(() => {
      dismissToast();
    }, 5000);

    return () => {
      if (toastDismissTimeoutRef.current !== null) {
        window.clearTimeout(toastDismissTimeoutRef.current);
        toastDismissTimeoutRef.current = null;
      }
    };
  }, [toastMessage, toastVersion]);

  useEffect(() => {
    return () => {
      clearToastTimers();
    };
  }, []);

  useEffect(() => {
    setMode(initialMode);
    setMessage('');
    clearToastTimers();
    setToastMessage('');
    setIsToastClosing(false);

    if (initialMode !== 'create') {
      setHasEmailConflict(false);
    }
  }, [initialMode]);

  function showError(nextMessage: string, options?: { highlightEmail?: boolean }) {
    setMessage('');
    clearToastTimers();
    setIsToastClosing(false);
    setToastMessage(nextMessage);
    setToastVersion((currentVersion) => currentVersion + 1);

    if (options?.highlightEmail) {
      setHasEmailConflict(true);
    }
  }

  function selectMode(nextMode: AuthMode) {
    setMode(nextMode);
    setMessage('');
    clearToastTimers();
    setToastMessage('');
    setIsToastClosing(false);

    if (nextMode !== 'create') {
      setHasEmailConflict(false);
    }
  }

  function clearEmailConflict() {
    if (hasEmailConflict) {
      setHasEmailConflict(false);
    }
  }

  function beginSubmission(nextMessage: string) {
    if (isSubmittingRef.current) return false;

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setMessage(nextMessage);
    return true;
  }

  function endSubmission() {
    isSubmittingRef.current = false;
    setIsSubmitting(false);
  }

  function handleToastTouchStart(event: TouchEvent<HTMLDivElement>) {
    toastTouchStartYRef.current = event.changedTouches[0]?.clientY ?? null;
  }

  function handleToastTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const startY = toastTouchStartYRef.current;
    const endY = event.changedTouches[0]?.clientY ?? null;

    toastTouchStartYRef.current = null;

    if (startY === null || endY === null) {
      return;
    }

    if (endY - startY >= 36) {
      dismissToast();
    }
  }

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedEmail = getFormValue(event.currentTarget, 'email').trim();
    const submittedPassword = getFormValue(event.currentTarget, 'password');

    setEmail(submittedEmail);
    setPassword(submittedPassword);

    if (!beginSubmission('Signing in')) return;

    try {
      const result = await loginUser({ email: submittedEmail, password: submittedPassword });
      onSession(result.token, result.user);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Sign-in failed.');
    } finally {
      endSubmission();
    }
  }

  async function handleCreateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedEmail = getFormValue(event.currentTarget, 'email').trim();
    const submittedDisplayName = getFormValue(event.currentTarget, 'displayName').trim();
    const submittedPassword = getFormValue(event.currentTarget, 'password');
    const digits = getPhoneDigits(phoneNumber);
    const nextPhoneNumber = getStoredPhoneNumber(phoneNumber);

    setEmail(submittedEmail);
    setDisplayName(submittedDisplayName);
    setPassword(submittedPassword);

    if (digits.length > 0 && digits.length !== 10) {
      showError('Enter a 10-digit phone number.');
      return;
    }

    if (!beginSubmission('Creating account')) return;

    try {
      const result = await createAccount({
        email: submittedEmail,
        displayName: submittedDisplayName,
        password: submittedPassword,
        phoneNumber: nextPhoneNumber || undefined,
        eventReminderOptIn,
        upcomingEventsOptIn,
      });
      setEmail(result.email);
      setHasEmailConflict(false);
      setMode('verify');
      setMessage('Enter the code sent to your email.');
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : 'Account creation failed.';

      showError(nextMessage, { highlightEmail: isExistingAccountError(nextMessage) });
    } finally {
      endSubmission();
    }
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedEmail = getFormValue(event.currentTarget, 'email').trim();
    const submittedCode = getFormValue(event.currentTarget, 'code').trim();

    setEmail(submittedEmail);
    setCode(submittedCode);

    if (!beginSubmission('Verifying code')) return;

    try {
      const result = await verifyAccount({ email: submittedEmail, code: submittedCode });
      onSession(result.token, result.user);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Verification failed.');
    } finally {
      endSubmission();
    }
  }

  async function handleRequestPasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedEmail = getFormValue(event.currentTarget, 'email').trim();

    setEmail(submittedEmail);

    if (!beginSubmission('Sending reset code')) return;

    try {
      const result = await requestPasswordReset({ email: submittedEmail });
      setEmail(result.email);
      setCode('');
      setResetPassword('');
      setResetPasswordConfirm('');
      setMode('reset');
      setMessage('Enter the reset code sent to your email.');
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Could not send reset code.');
    } finally {
      endSubmission();
    }
  }

  async function handleResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const submittedEmail = getFormValue(event.currentTarget, 'email').trim();
    const submittedCode = getFormValue(event.currentTarget, 'code').trim();
    const submittedResetPassword = getFormValue(event.currentTarget, 'newPassword');
    const submittedResetPasswordConfirm = getFormValue(event.currentTarget, 'confirmNewPassword');

    setEmail(submittedEmail);
    setCode(submittedCode);
    setResetPassword(submittedResetPassword);
    setResetPasswordConfirm(submittedResetPasswordConfirm);

    if (submittedResetPassword.length < 8) {
      showError('New password must be at least 8 characters.');
      return;
    }

    if (submittedResetPassword !== submittedResetPasswordConfirm) {
      showError('New passwords do not match.');
      return;
    }

    if (!beginSubmission('Resetting password')) return;

    try {
      await confirmPasswordReset({ email: submittedEmail, code: submittedCode, newPassword: submittedResetPassword });
      setPassword('');
      setResetPassword('');
      setResetPasswordConfirm('');
      setCode('');
      setMode('sign-in');
      setMessage('Password reset. Sign in with your new password.');
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Password reset failed.');
    } finally {
      endSubmission();
    }
  }

  return (
    <>
    {toastMessage ? (
      <div className="toast-stack" aria-live="assertive" aria-atomic="true">
        <div
          key={toastVersion}
          className={`toast-message toast-message-error${isToastClosing ? ' toast-message-closing' : ''}`}
          role="alert"
          onClick={dismissToast}
          onTouchStart={handleToastTouchStart}
          onTouchEnd={handleToastTouchEnd}
          onTouchCancel={() => {
            toastTouchStartYRef.current = null;
          }}
        >
          {toastMessage}
        </div>
      </div>
    ) : null}
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
            <input
              name="email"
              type="email"
              required
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
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
            <input name="displayName" required autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </label>
          <PhoneNumberInput label="Phone Number (Optional)" value={phoneNumber} onChange={setPhoneNumber} />
          <label>
            Email
            <input
              name="email"
              className={hasEmailConflict ? 'input-error' : undefined}
              type="email"
              required
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={hasEmailConflict || undefined}
              value={email}
              onFocus={clearEmailConflict}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <div className="auth-preferences-group" aria-label="Notification preferences">
            <label className="checkout-checkbox">
              <input type="checkbox" checked={eventReminderOptIn} onChange={(event) => setEventReminderOptIn(event.target.checked)} />
              <span>Remind me about the events I buy tickets for.</span>
            </label>
            <label className="checkout-checkbox">
              <input type="checkbox" checked={upcomingEventsOptIn} onChange={(event) => setUpcomingEventsOptIn(event.target.checked)} />
              <span>Keep me posted on new events and ticket releases.</span>
            </label>
          </div>
          <button type="submit" disabled={isSubmitting}>
            Send Verification Code
          </button>
        </form>
      ) : null}
      {mode === 'verify' ? (
        <form className="stack-form" onSubmit={handleVerify}>
          <label>
            Email
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Verification code
            <input name="code" inputMode="numeric" pattern="[0-9]{6}" required autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} />
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
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
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
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Reset code
            <input name="code" inputMode="numeric" pattern="[0-9]{6}" required autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} />
          </label>
          <label>
            New Password
            <input
              name="newPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={resetPassword}
              onChange={(event) => setResetPassword(event.target.value)}
            />
          </label>
          <label>
            Confirm New Password
            <input
              name="confirmNewPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={resetPasswordConfirm}
              onChange={(event) => setResetPasswordConfirm(event.target.value)}
            />
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