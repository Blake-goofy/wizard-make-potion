import { FormEvent, useEffect, useState } from 'react';
import type { AccountProfile, SessionUser } from '@potion/shared';
import LoadingOverlay from '../components/LoadingOverlay';
import { PhoneNumberInput, createPhoneMask, getPhoneDigits, getStoredPhoneNumber } from '../components/PhoneNumberInput';
import { deleteAccount, getAccountProfile, updateAccount } from '../lib/api';

type AccountPageProps = {
  token: string;
  user: SessionUser | null;
  onUserChange: (user: SessionUser) => void;
  onAccountDeleted: () => void;
};

export default function AccountPage({ token, user, onUserChange, onAccountDeleted }: AccountPageProps) {
  const [profile, setProfile] = useState<AccountProfile | null>(user);
  const [phoneNumber, setPhoneNumber] = useState(createPhoneMask(user?.phoneNumber));
  const [message, setMessage] = useState('Loading account settings.');
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!user) return;

    setProfile(user);
    setPhoneNumber(createPhoneMask(user.phoneNumber));
  }, [user]);

  useEffect(() => {
    let isCurrent = true;

    setIsLoadingProfile(true);

    getAccountProfile(token)
      .then((result) => {
        if (!isCurrent) return;
        setProfile(result.account);
        setPhoneNumber(createPhoneMask(result.account.phoneNumber));
        setMessage('');
      })
      .catch((error) => {
        if (!isCurrent) return;
        setMessage(error instanceof Error ? error.message : 'Could not load account settings.');
      })
      .finally(() => {
        if (isCurrent) setIsLoadingProfile(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [token]);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    const digits = getPhoneDigits(phoneNumber);
    const nextPhoneNumber = getStoredPhoneNumber(phoneNumber);

    if (digits.length > 0 && digits.length !== 10) {
      setMessage('Enter a 10-digit phone number.');
      return;
    }

    setIsSaving(true);
    setMessage('Saving account settings.');

    try {
      const result = await updateAccount({ phoneNumber: nextPhoneNumber ? nextPhoneNumber : null }, token);
      setProfile(result.account);
      setPhoneNumber(createPhoneMask(result.account.phoneNumber));
      onUserChange(result.account);
      setMessage('Account settings saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save account settings.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteAccount() {
    if (!window.confirm('Are you sure you want to delete this account? This will sign you out and remove access to your account page until you register again.')) {
      return;
    }

    setIsDeleting(true);
    setMessage('Deleting account.');

    try {
      await deleteAccount(token);
      onAccountDeleted();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not delete account.');
      setIsDeleting(false);
    }
  }

  const loadingLabel = isDeleting ? 'Deleting account' : isSaving ? 'Saving account settings' : 'Loading account settings';
  const loadingDetail = isDeleting
    ? 'Removing your account and signing you out.'
    : isSaving
      ? 'Updating the account details on file.'
      : 'Loading the latest account profile.';

  return (
    <>
    <section className="content-panel account-settings-panel">
      <div>
        <p className="eyebrow">Account</p>
        <h1>Settings</h1>
        <p className="status-text">Manage the phone number we keep on file and deactivate this account.</p>
      </div>

      <div className="account-meta-grid">
        <div className="account-meta-card">
          <span className="account-meta-label">Name</span>
          <strong>{profile?.displayName ?? 'Loading'}</strong>
        </div>
        <div className="account-meta-card">
          <span className="account-meta-label">Email</span>
          <strong>{profile?.email ?? 'Loading'}</strong>
        </div>
      </div>

      <form className="stack-form account-settings-form" onSubmit={handleSave}>
        <PhoneNumberInput label="Phone Number (Optional)" value={phoneNumber} onChange={setPhoneNumber} />
        <div className="account-actions">
          <button type="submit" disabled={isSaving || isDeleting}>
            {isSaving ? 'Saving' : 'Save Phone Number'}
          </button>
        </div>
      </form>

      <section className="account-danger-zone" aria-label="Delete account">
        <div>
          <h2>Delete Account</h2>
          <p className="status-text">This deactivates your account and signs you out. Your order records stay with past purchases.</p>
        </div>
        <button className="danger-button" type="button" disabled={isSaving || isDeleting} onClick={handleDeleteAccount}>
          {isDeleting ? 'Deleting' : 'Delete Account'}
        </button>
      </section>

      {message ? <p className="status-text">{message}</p> : null}
    </section>
    {isLoadingProfile || isSaving || isDeleting ? <LoadingOverlay label={loadingLabel} detail={loadingDetail} variant="account" /> : null}
    </>
  );
}