import { KeyboardEvent, TouchEvent, useEffect, useRef, useState } from 'react';
import type { AccountProfile, SessionUser } from '@potion/shared';
import ActionDialog from '../components/ActionDialog';
import FieldActionButtons from '../components/FieldActionButtons';
import LoadingOverlay from '../components/LoadingOverlay';
import { PhoneNumberInput, createPhoneMask, getPhoneDigits, getStoredPhoneNumber } from '../components/PhoneNumberInput';
import { changePassword, confirmPhoneVerification, deleteAccount, getAccountProfile, requestPhoneVerification, updateAccount } from '../lib/api';

type AccountPageProps = {
  token: string;
  user: SessionUser | null;
  onUserChange: (user: SessionUser) => void;
  onAccountDeleted: () => void;
};

function handleFieldKeyDown(event: KeyboardEvent<HTMLInputElement>, options: { isDirty: boolean; onCancel: () => void; onConfirm: () => void }) {
  if (event.key === 'Escape' && options.isDirty) {
    event.preventDefault();
    options.onCancel();
    return;
  }

  if (event.key === 'Enter' && options.isDirty) {
    event.preventDefault();
    options.onConfirm();
  }
}

function NotificationIcon() {
  return (
    <svg className="account-notification-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 4.5a4.5 4.5 0 0 0-4.5 4.5v2.25c0 .98-.31 1.93-.89 2.72L5 16.5h14l-1.61-2.53a5.05 5.05 0 0 1-.89-2.72V9A4.5 4.5 0 0 0 12 4.5Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

export default function AccountPage({ token, user, onUserChange, onAccountDeleted }: AccountPageProps) {
  const [profile, setProfile] = useState<AccountProfile | null>(user);
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [phoneNumber, setPhoneNumber] = useState(createPhoneMask(user?.phoneNumber));
  const [smsOptIn, setSmsOptIn] = useState(user?.smsOptIn ?? false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phoneVerificationCode, setPhoneVerificationCode] = useState('');
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSendingPhoneVerification, setIsSendingPhoneVerification] = useState(false);
  const [isConfirmingPhoneVerification, setIsConfirmingPhoneVerification] = useState(false);
  const [hasRequestedPhoneVerification, setHasRequestedPhoneVerification] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastTone, setToastTone] = useState<'success' | 'error'>('success');
  const [toastVersion, setToastVersion] = useState(0);
  const [isToastClosing, setIsToastClosing] = useState(false);
  const toastDismissTimeoutRef = useRef<number | null>(null);
  const toastCloseTimeoutRef = useRef<number | null>(null);
  const toastTouchStartYRef = useRef<number | null>(null);
  const isSavingRef = useRef(false);
  const isChangingPasswordRef = useRef(false);
  const isDeletingRef = useRef(false);
  const persistedDisplayName = profile?.displayName ?? '';
  const persistedPhoneNumber = createPhoneMask(profile?.phoneNumber);
  const isDisplayNameDirty = displayName.trim() !== persistedDisplayName;
  const isPhoneNumberDirty = phoneNumber !== persistedPhoneNumber;
  const hasSavedPhoneNumber = Boolean(profile?.phoneNumber);
  const isPhoneVerified = Boolean(profile?.phoneVerifiedAt);

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

  function showToast(nextMessage: string, tone: 'success' | 'error' = 'success') {
    clearToastTimers();
    setIsToastClosing(false);
    setToastTone(tone);
    setToastMessage(nextMessage);
    setToastVersion((currentVersion) => currentVersion + 1);
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

  function resetPasswordForm() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  }

  useEffect(() => {
    if (!user) return;

    setProfile(user);
    setDisplayName(user.displayName);
    setPhoneNumber(createPhoneMask(user.phoneNumber));
    setSmsOptIn(user.smsOptIn);
  }, [user]);

  useEffect(() => {
    let isCurrent = true;

    setIsLoadingProfile(true);

    getAccountProfile(token)
      .then((result) => {
        if (!isCurrent) return;
        setProfile(result.account);
        setDisplayName(result.account.displayName);
        setPhoneNumber(createPhoneMask(result.account.phoneNumber));
        setSmsOptIn(result.account.smsOptIn);
      })
      .catch((error) => {
        if (!isCurrent) return;
        showToast(error instanceof Error ? error.message : 'Could not load account settings.', 'error');
      })
      .finally(() => {
        if (isCurrent) setIsLoadingProfile(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [token]);

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
    if (!profile?.phoneNumber || profile.phoneVerifiedAt) {
      setHasRequestedPhoneVerification(false);
      setPhoneVerificationCode('');
    }

  }, [profile?.phoneNumber, profile?.phoneVerifiedAt]);

  async function saveAccountChanges(nextValues: {
    displayName?: string;
    phoneNumber?: string | null;
    smsOptIn?: boolean;
  }) {
    if (!profile) {
      return null;
    }

    const result = await updateAccount(
      {
        displayName: nextValues.displayName ?? profile.displayName,
        phoneNumber: nextValues.phoneNumber === undefined ? profile.phoneNumber : nextValues.phoneNumber,
        smsOptIn: nextValues.smsOptIn ?? profile.smsOptIn,
      },
      token,
    );

    setProfile(result.account);
    onUserChange(result.account);
    return result.account;
  }

  async function handleSaveDisplayName() {
    const nextDisplayName = displayName.trim();

    if (!nextDisplayName) {
      showToast('Enter your name.', 'error');
      return;
    }

    if (!profile || nextDisplayName === profile.displayName) {
      return;
    }

    if (isSavingRef.current) return;

    isSavingRef.current = true;
    setIsSaving(true);

    try {
      const account = await saveAccountChanges({ displayName: nextDisplayName });

      if (account) {
        setDisplayName(account.displayName);
      }

      showToast('Settings saved.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not save account changes.', 'error');
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }

  async function handleSavePhoneNumber() {
    const digits = getPhoneDigits(phoneNumber);
    const nextPhoneNumber = getStoredPhoneNumber(phoneNumber);

    if (digits.length > 0 && digits.length !== 10) {
      showToast('Enter a 10-digit phone number.', 'error');
      return;
    }

    if (!profile || nextPhoneNumber === profile.phoneNumber) {
      return;
    }

    if (isSavingRef.current) return;

    isSavingRef.current = true;
    setIsSaving(true);

    try {
      const isRemovingPhoneNumber = !nextPhoneNumber;
      const account = await saveAccountChanges({
        phoneNumber: nextPhoneNumber ? nextPhoneNumber : null,
        smsOptIn: isRemovingPhoneNumber ? false : undefined,
      });

      if (account) {
        setPhoneNumber(createPhoneMask(account.phoneNumber));
        setSmsOptIn(account.smsOptIn);
        setHasRequestedPhoneVerification(false);
        setPhoneVerificationCode('');
      }

      showToast(nextPhoneNumber ? 'Phone number saved. Verify it before using text alerts.' : 'Phone number removed. Text alerts turned off.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not save account changes.', 'error');
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }

  async function handleChangePassword() {
    if (!currentPassword) {
      showToast('Enter your current password.', 'error');
      return;
    }

    if (newPassword.length < 8) {
      showToast('New password must be at least 8 characters.', 'error');
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match.', 'error');
      return;
    }

    if (isChangingPasswordRef.current) return;

    isChangingPasswordRef.current = true;
    setIsChangingPassword(true);

    try {
      await changePassword({ currentPassword, newPassword }, token);
      resetPasswordForm();
      setIsPasswordDialogOpen(false);
      showToast('Password changed.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not change password.', 'error');
    } finally {
      isChangingPasswordRef.current = false;
      setIsChangingPassword(false);
    }
  }

  async function handleSavePreferences(nextSmsOptIn: boolean) {
    if (!profile) {
      return;
    }

    if (isSavingRef.current) return;

    const previousSmsOptIn = smsOptIn;

    setSmsOptIn(nextSmsOptIn);

    if (nextSmsOptIn && isPhoneNumberDirty) {
      showToast('Save your phone number before enabling text alerts.', 'error');
      setSmsOptIn(previousSmsOptIn);
      return;
    }

    if (nextSmsOptIn && !profile.phoneNumber) {
      showToast('Add a phone number before enabling text alerts.', 'error');
      setSmsOptIn(previousSmsOptIn);
      return;
    }

    isSavingRef.current = true;
    setIsSaving(true);

    try {
      const account = await saveAccountChanges({ smsOptIn: nextSmsOptIn });

      if (account) {
        setSmsOptIn(account.smsOptIn);
      }

      showToast(
        nextSmsOptIn && !account?.phoneVerifiedAt
          ? 'Settings saved. Verify your phone number before text alerts can be sent.'
          : 'Settings saved.',
        'success',
      );
    } catch (error) {
      setSmsOptIn(previousSmsOptIn);
      showToast(error instanceof Error ? error.message : 'Could not save account changes.', 'error');
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }

  async function handleRequestPhoneVerification() {
    if (isPhoneNumberDirty) {
      showToast('Save your phone number before requesting a verification code.', 'error');
      return;
    }

    if (!profile?.phoneNumber) {
      showToast('Add a phone number before requesting a verification code.', 'error');
      return;
    }

    setIsSendingPhoneVerification(true);

    try {
      const result = await requestPhoneVerification(token);
      setHasRequestedPhoneVerification(true);
      showToast(result.message, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not send a verification code.', 'error');
    } finally {
      setIsSendingPhoneVerification(false);
    }
  }

  async function handleConfirmPhoneVerification() {
    if (!/^\d{6}$/.test(phoneVerificationCode.trim())) {
      showToast('Enter the 6-digit verification code.', 'error');
      return;
    }

    setIsConfirmingPhoneVerification(true);

    try {
      const result = await confirmPhoneVerification({ code: phoneVerificationCode.trim() }, token);
      setProfile(result.account);
      onUserChange(result.account);
      setPhoneNumber(createPhoneMask(result.account.phoneNumber));
      setHasRequestedPhoneVerification(false);
      setPhoneVerificationCode('');
      showToast('Phone number verified.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not verify your phone number.', 'error');
    } finally {
      setIsConfirmingPhoneVerification(false);
    }
  }

  async function handleDeleteAccount() {
    if (isDeletingRef.current) return;

    isDeletingRef.current = true;
    setIsDeleting(true);

    try {
      await deleteAccount(token);
      onAccountDeleted();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not delete account.', 'error');
      isDeletingRef.current = false;
      setIsDeleting(false);
    }
  }

  const loadingLabel = isDeleting
    ? 'Deleting account'
    : isSaving
      ? 'Saving account changes'
      : isSendingPhoneVerification
        ? 'Sending verification text'
        : isConfirmingPhoneVerification
          ? 'Verifying phone number'
          : 'Loading account settings';
  const loadingDetail = isDeleting
    ? 'Removing your account and signing you out.'
    : isSaving
      ? 'Updating the account details on file.'
      : isSendingPhoneVerification
        ? 'Sending a verification code to your saved phone number.'
        : isConfirmingPhoneVerification
          ? 'Confirming your phone number.'
          : 'Loading the latest account profile.';

  return (
    <>
    {toastMessage ? (
      <div className="toast-stack" aria-live="assertive" aria-atomic="true">
        <div
          key={toastVersion}
          className={`toast-message ${toastTone === 'error' ? 'toast-message-error' : 'toast-message-success'}${isToastClosing ? ' toast-message-closing' : ''}`}
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
    <section className="content-panel account-settings-panel">
      <div className="account-meta-grid">
        <div className="account-meta-card">
          <span className="account-meta-label">Email</span>
          <strong>{profile?.email ?? 'Loading'}</strong>
        </div>
      </div>

      <div className="stack-form account-settings-form">
        <label>
          Name
          <div className={`field-editor-shell${isDisplayNameDirty ? ' has-field-actions' : ''}`}>
            <input
              required
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              onKeyDown={(event) => {
                handleFieldKeyDown(event, {
                  isDirty: isDisplayNameDirty,
                  onCancel: () => setDisplayName(persistedDisplayName),
                  onConfirm: () => {
                    void handleSaveDisplayName();
                  },
                });
              }}
            />
            {isDisplayNameDirty ? (
              <FieldActionButtons
                label="name"
                disabled={isSaving || isDeleting}
                onCancel={() => setDisplayName(persistedDisplayName)}
                onConfirm={() => void handleSaveDisplayName()}
              />
            ) : null}
          </div>
        </label>
        <PhoneNumberInput
          label="Phone Number (Optional)"
          value={phoneNumber}
          onChange={setPhoneNumber}
          onEnter={() => {
            if (isPhoneNumberDirty) {
              void handleSavePhoneNumber();
            }
          }}
          onEscape={() => {
            if (isPhoneNumberDirty) {
              setPhoneNumber(persistedPhoneNumber);
            }
          }}
          trailingActions={
            isPhoneNumberDirty ? (
              <FieldActionButtons
                label="phone number"
                disabled={isSaving || isDeleting}
                onCancel={() => setPhoneNumber(persistedPhoneNumber)}
                onConfirm={() => void handleSavePhoneNumber()}
              />
            ) : null
          }
        />
        {hasSavedPhoneNumber && !isPhoneVerified ? (
          <div className="account-phone-verification-actions" aria-label="Phone verification">
            <button
              type="button"
              className="primary-button button-with-arrow"
              disabled={isSaving || isDeleting || isSendingPhoneVerification || isConfirmingPhoneVerification || isPhoneNumberDirty}
              onClick={() => void handleRequestPhoneVerification()}
            >
              <NotificationIcon />
              {hasRequestedPhoneVerification ? 'Send Another Code' : 'Send Text Verification Code'}
            </button>
            {hasRequestedPhoneVerification ? (
              <div className="account-phone-verification-form">
                <label>
                  Verification code
                  <input
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    autoComplete="one-time-code"
                    value={phoneVerificationCode}
                    onChange={(event) => setPhoneVerificationCode(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  disabled={isSaving || isDeleting || isSendingPhoneVerification || isConfirmingPhoneVerification}
                  onClick={() => void handleConfirmPhoneVerification()}
                >
                  Verify Phone Number
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="account-preferences-group" aria-label="Notification preferences">
          <p className="account-preferences-heading">Notifications</p>
          <label className="checkout-checkbox">
            <input
              type="checkbox"
              checked={smsOptIn}
              disabled={isSaving || isDeleting}
              onChange={(event) => {
                void handleSavePreferences(event.target.checked);
              }}
            />
            <span>I agree to receive SMS event reminders and upcoming event announcements from Wizard Make Potion.</span>
          </label>
          <p className="sms-consent-disclosure">
            By checking this box and providing your phone number, you agree to receive SMS event reminders and upcoming event
            announcements from Wizard Make Potion. Message frequency may vary. Standard Message and Data Rates may apply.
            Reply STOP to opt out. Reply HELP for help. We will not share mobile information with third parties for promotional
            or marketing purposes. Consent is optional and is not a condition of purchase. See our{' '}
            <a href="/terms-and-conditions">Terms and Conditions</a> and <a href="/privacy-policy">Privacy Policy</a>.
          </p>
        </div>
        <div className="account-actions">
          <button type="button" disabled={isSaving || isDeleting || isChangingPassword} onClick={() => setIsPasswordDialogOpen(true)}>
            Change Password
          </button>
        </div>
      </div>

      <section className="account-danger-zone" aria-label="Delete account">
        <div>
          <h2>Delete Account</h2>
          <p className="status-text">This deactivates your account and signs you out. Your order records stay with past purchases.</p>
        </div>
        <button className="danger-button" type="button" disabled={isSaving || isDeleting} onClick={() => setIsDeleteDialogOpen(true)}>
          {isDeleting ? 'Deleting' : 'Delete Account'}
        </button>
      </section>

    </section>
    <ActionDialog
      confirmLabel="Change Password"
      description="Enter your current password and choose a new one."
      isOpen={isPasswordDialogOpen}
      isSubmitting={isChangingPassword}
      submittingLabel="Saving"
      title="Change Password"
      onClose={() => {
        setIsPasswordDialogOpen(false);
        resetPasswordForm();
      }}
      onConfirm={() => void handleChangePassword()}
    >
      <div className="stack-form">
        <label>
          Current Password
          <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
        </label>
        <label>
          New Password
          <input type="password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
        </label>
        <label>
          Confirm New Password
          <input type="password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
        </label>
      </div>
    </ActionDialog>
    <ActionDialog
      confirmLabel="Delete Account"
      confirmTone="danger"
      description="Are you sure you want to delete this account? This will sign you out and remove access to your account page until you register again."
      isOpen={isDeleteDialogOpen}
      isSubmitting={isDeleting}
      submittingLabel="Deleting"
      title="Delete Account"
      onClose={() => setIsDeleteDialogOpen(false)}
      onConfirm={() => void handleDeleteAccount()}
    />
    {isLoadingProfile || isSaving || isDeleting || isSendingPhoneVerification || isConfirmingPhoneVerification ? <LoadingOverlay label={loadingLabel} detail={loadingDetail} variant="account" /> : null}
    </>
  );
}
