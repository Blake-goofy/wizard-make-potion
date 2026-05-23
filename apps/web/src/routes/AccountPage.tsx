import { KeyboardEvent, TouchEvent, useEffect, useRef, useState } from 'react';
import type { AccountProfile, SessionUser } from '@potion/shared';
import ActionDialog from '../components/ActionDialog';
import FieldActionButtons from '../components/FieldActionButtons';
import LoadingOverlay from '../components/LoadingOverlay';
import { PhoneNumberInput, createPhoneMask, getPhoneDigits, getStoredPhoneNumber } from '../components/PhoneNumberInput';
import { changePassword, deleteAccount, getAccountProfile, updateAccount } from '../lib/api';

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

export default function AccountPage({ token, user, onUserChange, onAccountDeleted }: AccountPageProps) {
  const [profile, setProfile] = useState<AccountProfile | null>(user);
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [phoneNumber, setPhoneNumber] = useState(createPhoneMask(user?.phoneNumber));
  const [eventReminderOptIn, setEventReminderOptIn] = useState(user?.eventReminderOptIn ?? false);
  const [upcomingEventsOptIn, setUpcomingEventsOptIn] = useState(user?.upcomingEventsOptIn ?? false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
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
  const persistedEventReminderOptIn = profile?.eventReminderOptIn ?? false;
  const persistedUpcomingEventsOptIn = profile?.upcomingEventsOptIn ?? false;
  const isDisplayNameDirty = displayName.trim() !== persistedDisplayName;
  const isPhoneNumberDirty = phoneNumber !== persistedPhoneNumber;
  const isPreferencesDirty = eventReminderOptIn !== persistedEventReminderOptIn || upcomingEventsOptIn !== persistedUpcomingEventsOptIn;

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
    setEventReminderOptIn(user.eventReminderOptIn);
    setUpcomingEventsOptIn(user.upcomingEventsOptIn);
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
        setEventReminderOptIn(result.account.eventReminderOptIn);
        setUpcomingEventsOptIn(result.account.upcomingEventsOptIn);
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

  async function saveAccountChanges(nextValues: {
    displayName?: string;
    phoneNumber?: string | null;
    eventReminderOptIn?: boolean;
    upcomingEventsOptIn?: boolean;
  }) {
    if (!profile) {
      return null;
    }

    const result = await updateAccount(
      {
        displayName: nextValues.displayName ?? profile.displayName,
        phoneNumber: nextValues.phoneNumber === undefined ? profile.phoneNumber : nextValues.phoneNumber,
        eventReminderOptIn: nextValues.eventReminderOptIn ?? profile.eventReminderOptIn,
        upcomingEventsOptIn: nextValues.upcomingEventsOptIn ?? profile.upcomingEventsOptIn,
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
      const account = await saveAccountChanges({ phoneNumber: nextPhoneNumber ? nextPhoneNumber : null });

      if (account) {
        setPhoneNumber(createPhoneMask(account.phoneNumber));
      }

      showToast('Settings saved.', 'success');
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

  async function handleSavePreferences() {
    if (!profile || !isPreferencesDirty) {
      return;
    }

    if (isSavingRef.current) return;

    isSavingRef.current = true;
    setIsSaving(true);

    try {
      const account = await saveAccountChanges({ eventReminderOptIn, upcomingEventsOptIn });

      if (account) {
        setEventReminderOptIn(account.eventReminderOptIn);
        setUpcomingEventsOptIn(account.upcomingEventsOptIn);
      }

      showToast('Settings saved.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not save account changes.', 'error');
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
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

  const loadingLabel = isDeleting ? 'Deleting account' : isSaving ? 'Saving account changes' : 'Loading account settings';
  const loadingDetail = isDeleting
    ? 'Removing your account and signing you out.'
    : isSaving
      ? 'Updating the account details on file.'
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
        <div className="account-preferences-group" aria-label="Notification preferences">
          <p className="account-preferences-heading">Notifications</p>
          <label className="checkout-checkbox">
            <input type="checkbox" checked={eventReminderOptIn} onChange={(event) => setEventReminderOptIn(event.target.checked)} />
            <span>Remind me about the events I buy tickets for.</span>
          </label>
          <label className="checkout-checkbox">
            <input type="checkbox" checked={upcomingEventsOptIn} onChange={(event) => setUpcomingEventsOptIn(event.target.checked)} />
            <span>Keep me posted on new events and ticket releases.</span>
          </label>
          {isPreferencesDirty ? (
            <div className="account-preferences-actions">
              <button
                type="button"
                disabled={isSaving || isDeleting}
                onClick={() => {
                  setEventReminderOptIn(persistedEventReminderOptIn);
                  setUpcomingEventsOptIn(persistedUpcomingEventsOptIn);
                }}
              >
                Cancel
              </button>
              <button type="button" className="primary-button" disabled={isSaving || isDeleting} onClick={() => void handleSavePreferences()}>
                Save Preferences
              </button>
            </div>
          ) : null}
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
    {isLoadingProfile || isSaving || isDeleting ? <LoadingOverlay label={loadingLabel} detail={loadingDetail} variant="account" /> : null}
    </>
  );
}