import { useEffect, useState, type KeyboardEvent } from 'react';
import type { AdminManagedUser, SessionUser } from '@potion/shared';
import FieldActionButtons from '../components/FieldActionButtons';
import LoadingOverlay from '../components/LoadingOverlay';
import ToastRegion from '../components/ToastRegion';
import { useToast } from '../hooks/useToast';
import { getAdminUsers, updateAdminUser } from '../lib/api';

type AdminUsersPageProps = {
  token: string;
  currentUser: SessionUser | null;
  onCurrentUserUpdated: (user: AdminManagedUser) => void;
};

function handleFieldKeyDown(event: KeyboardEvent<HTMLSelectElement>, options: { isDirty: boolean; onCancel: () => void; onConfirm: () => void }) {
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

export default function AdminUsersPage({ token, currentUser, onCurrentUserUpdated }: AdminUsersPageProps) {
  const [users, setUsers] = useState<AdminManagedUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [roleDraft, setRoleDraft] = useState<SessionUser['role']>('customer');
  const [isActiveDraft, setIsActiveDraft] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingRole, setIsSavingRole] = useState(false);
  const [isSavingActive, setIsSavingActive] = useState(false);
  const {
    toastMessage,
    toastTone,
    toastVersion,
    isToastClosing,
    showToast,
    dismissToast,
    handleToastTouchStart,
    handleToastTouchEnd,
    handleToastTouchCancel,
  } = useToast();

  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;
  const isRoleDirty = selectedUser ? roleDraft !== selectedUser.role : false;
  const isActiveDirty = selectedUser ? isActiveDraft !== selectedUser.isActive : false;

  useEffect(() => {
    let isCurrent = true;

    setIsLoading(true);

    getAdminUsers(token)
      .then((result) => {
        if (!isCurrent) {
          return;
        }

        setUsers(result.users);
        setSelectedUserId((currentSelection) => {
          if (currentSelection && result.users.some((user) => user.id === currentSelection)) {
            return currentSelection;
          }

          return result.users[0]?.id ?? '';
        });
      })
      .catch((error) => {
        if (!isCurrent) {
          return;
        }

        showToast(error instanceof Error ? error.message : 'Could not load user access settings.', 'error');
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [token]);

  useEffect(() => {
    const nextSelectedUser = users.find((user) => user.id === selectedUserId);

    if (!nextSelectedUser) {
      return;
    }

    setRoleDraft(nextSelectedUser.role);
    setIsActiveDraft(nextSelectedUser.isActive);
  }, [selectedUserId]);

  async function saveRole() {
    if (!selectedUser || !isRoleDirty || isSavingRole) {
      return;
    }

    setIsSavingRole(true);

    try {
      const result = await updateAdminUser(selectedUser.id, { role: roleDraft, isActive: selectedUser.isActive }, token);
      setUsers((currentUsers) => currentUsers.map((user) => (user.id === result.user.id ? result.user : user)));
      setRoleDraft(result.user.role);

      if (result.user.id === currentUser?.id) {
        onCurrentUserUpdated(result.user);
      }

      showToast('Role updated.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not update the user role.', 'error');
    } finally {
      setIsSavingRole(false);
    }
  }

  async function saveActiveState() {
    if (!selectedUser || !isActiveDirty || isSavingActive) {
      return;
    }

    setIsSavingActive(true);

    try {
      const result = await updateAdminUser(selectedUser.id, { role: selectedUser.role, isActive: isActiveDraft }, token);
      setUsers((currentUsers) => currentUsers.map((user) => (user.id === result.user.id ? result.user : user)));
      setIsActiveDraft(result.user.isActive);

      if (result.user.id === currentUser?.id) {
        onCurrentUserUpdated(result.user);
      }

      showToast('Account status updated.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not update the account status.', 'error');
    } finally {
      setIsSavingActive(false);
    }
  }

  return (
    <>
      <ToastRegion
        isClosing={isToastClosing}
        message={toastMessage}
        tone={toastTone}
        version={toastVersion}
        onDismiss={dismissToast}
        onTouchStart={handleToastTouchStart}
        onTouchEnd={handleToastTouchEnd}
        onTouchCancel={handleToastTouchCancel}
      />
      <section className="content-panel admin-users-panel">
        <div className="admin-users-header">
          <p className="eyebrow">Admin</p>
          <h1>User Access</h1>
          <p className="status-text">Select a user, then confirm each role or status change with its matching checkmark.</p>
        </div>

        <div className="stack-form admin-users-form">
          <label>
            User
            <select value={selectedUserId} disabled={isLoading || users.length === 0} onChange={(event) => setSelectedUserId(event.target.value)}>
              {users.length === 0 ? <option value="">No users available</option> : null}
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName}
                </option>
              ))}
            </select>
          </label>

          {selectedUser ? (
            <>
              <div className="account-meta-grid">
                <div className="account-meta-card">
                  <span className="account-meta-label">Email</span>
                  <strong>{selectedUser.email}</strong>
                </div>
              </div>

              <label>
                Role
                <div className={`field-editor-shell field-editor-shell-select${isRoleDirty ? ' has-field-actions' : ''}`}>
                  <select
                    value={roleDraft}
                    disabled={isLoading || isSavingRole || isSavingActive}
                    onChange={(event) => setRoleDraft(event.target.value as SessionUser['role'])}
                    onKeyDown={(event) => {
                      handleFieldKeyDown(event, {
                        isDirty: isRoleDirty,
                        onCancel: () => {
                          if (selectedUser) {
                            setRoleDraft(selectedUser.role);
                          }
                        },
                        onConfirm: () => {
                          void saveRole();
                        },
                      });
                    }}
                  >
                    <option value="customer">Customer</option>
                    <option value="scanner">Scanner</option>
                    <option value="admin">Admin</option>
                  </select>
                  {isRoleDirty ? (
                    <FieldActionButtons
                      label="role"
                      disabled={isSavingRole || isSavingActive}
                      onCancel={() => setRoleDraft(selectedUser.role)}
                      onConfirm={() => void saveRole()}
                    />
                  ) : null}
                </div>
              </label>

              <label>
                Account Status
                <div className={`field-editor-shell field-editor-shell-select${isActiveDirty ? ' has-field-actions' : ''}`}>
                  <select
                    value={isActiveDraft ? 'active' : 'inactive'}
                    disabled={isLoading || isSavingRole || isSavingActive}
                    onChange={(event) => setIsActiveDraft(event.target.value === 'active')}
                    onKeyDown={(event) => {
                      handleFieldKeyDown(event, {
                        isDirty: isActiveDirty,
                        onCancel: () => {
                          if (selectedUser) {
                            setIsActiveDraft(selectedUser.isActive);
                          }
                        },
                        onConfirm: () => {
                          void saveActiveState();
                        },
                      });
                    }}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                  {isActiveDirty ? (
                    <FieldActionButtons
                      label="account status"
                      disabled={isSavingRole || isSavingActive}
                      onCancel={() => setIsActiveDraft(selectedUser.isActive)}
                      onConfirm={() => void saveActiveState()}
                    />
                  ) : null}
                </div>
              </label>
            </>
          ) : (
            <p className="status-text">No user selected.</p>
          )}
        </div>
      </section>
      {isLoading ? <LoadingOverlay label="Loading admin users" detail="Fetching user roles and account status." variant="account" /> : null}
    </>
  );
}