import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AdminManagedUser, SessionUser } from '@potion/shared';
import LoadingOverlay, { type LoadingSkeletonVariant } from './components/LoadingOverlay';
import { HomePage } from './routes/HomePage';
import { WizardHatMark } from './components/WizardHatMark';
import { getCurrentUser } from './lib/api';

const AccountPage = lazy(() => import('./routes/AccountPage'));
const AdminEventsPage = lazy(() => import('./routes/AdminEventsPage'));
const AdminUsersPage = lazy(() => import('./routes/AdminUsersPage'));
const SalesPage = lazy(() => import('./routes/SalesPage'));
const MyTicketsPage = lazy(() => import('./routes/MyTicketsPage'));
const AuthPage = lazy(() => import('./routes/AuthPage'));
const ConfirmationPage = lazy(() => import('./routes/ConfirmationPage'));
const GuestCheckoutPage = lazy(() => import('./routes/GuestCheckoutPage'));
const ScanPage = lazy(() => import('./routes/ScanPage'));

type RouteKey = 'home' | 'myTickets' | 'account' | 'adminEvents' | 'adminUsers' | 'auth' | 'createAccount' | 'guestCheckout' | 'scan' | 'sales' | 'confirmation';

const sessionTokenKey = 'sessionToken';
const routeHashByKey: Record<Exclude<RouteKey, 'confirmation'>, string> = {
  home: '',
  myTickets: 'my-tickets',
  account: 'account',
  adminEvents: 'admin-events',
  adminUsers: 'admin-users',
  auth: 'sign-in',
  createAccount: 'create-account',
  guestCheckout: 'guest-checkout',
  scan: 'scan',
  sales: 'sales',
};
const routeKeyByHash: Record<string, Exclude<RouteKey, 'confirmation'>> = {
  '': 'home',
  home: 'home',
  tickets: 'home',
  'my-tickets': 'myTickets',
  account: 'account',
  'admin-events': 'adminEvents',
  events: 'adminEvents',
  'admin-users': 'adminUsers',
  users: 'adminUsers',
  'sign-in': 'auth',
  'create-account': 'createAccount',
  'guest-checkout': 'guestCheckout',
  checkout: 'guestCheckout',
  scan: 'scan',
  scanner: 'scan',
  sales: 'sales',
  'ticket-sales': 'sales',
};

function getConfirmationOrderIdFromLocation() {
  return new URLSearchParams(window.location.search).get('order') ?? '';
}

function syncConfirmationOrderId(orderId: string) {
  const url = new URL(window.location.href);

  if (orderId) {
    url.searchParams.set('order', orderId);
  } else {
    url.searchParams.delete('order');
  }

  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function getRouteFromHash() {
  const hash = window.location.hash.replace(/^#/, '').toLowerCase();

  return routeKeyByHash[hash] ?? 'home';
}

function syncRouteHash(route: RouteKey) {
  if (route === 'confirmation') return;

  const url = new URL(window.location.href);
  url.hash = routeHashByKey[route];
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function getRouteLoadingVariant(route: RouteKey): LoadingSkeletonVariant {
  if (route === 'home') return 'purchase';
  if (route === 'myTickets') return 'tickets';
  if (route === 'scan') return 'scanner';
  if (route === 'adminEvents') return 'account';
  if (route === 'adminUsers') return 'account';
  if (route === 'createAccount') return 'auth';
  if (route === 'guestCheckout') return 'purchase';
  return route;
}

function getRouteTitle(route: RouteKey) {
  if (route === 'home') return 'Wizard Make Potion';
  if (route === 'myTickets') return 'My Tickets';
  if (route === 'account') return 'Account';
  if (route === 'adminEvents') return 'Events';
  if (route === 'adminUsers') return 'User Access';
  if (route === 'auth') return 'Sign In';
  if (route === 'createAccount') return 'Create Account';
  if (route === 'guestCheckout') return 'Checkout';
  if (route === 'scan') return 'Scan Tickets';
  if (route === 'sales') return 'Ticket Sales';
  if (route === 'confirmation') return 'Order Confirmation';
  return 'Wizard Make Potion';
}

function DrawerItem({
  active,
  children,
  icon,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className={`drawer-nav-item${active ? ' active' : ''}`} type="button" onClick={onClick}>
      <span aria-hidden="true" className="drawer-nav-icon">
        {icon}
      </span>
      <span>{children}</span>
    </button>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function AccountIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6.5 9.5V20h11V9.5" />
    </svg>
  );
}

function TicketIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 8.5A2.5 2.5 0 0 0 6.5 11 2.5 2.5 0 0 0 4 13.5V17a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3.5A2.5 2.5 0 0 0 17.5 11 2.5 2.5 0 0 0 20 8.5V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2Z" />
      <path d="M12 7.5v9" />
    </svg>
  );
}

function ScanIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 4H5a1 1 0 0 0-1 1v2" />
      <path d="M17 4h2a1 1 0 0 1 1 1v2" />
      <path d="M20 17v2a1 1 0 0 1-1 1h-2" />
      <path d="M4 17v2a1 1 0 0 0 1 1h2" />
      <path d="M7 12h10" />
      <path d="M8 9h1M11 9h5M8 15h2M13 15h3" />
    </svg>
  );
}

function SalesIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 19V9" />
      <path d="M12 19V5" />
      <path d="M19 19v-7" />
      <path d="M3.5 19.5h17" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 4v3M17 4v3" />
      <path d="M5.5 6h13A1.5 1.5 0 0 1 20 7.5v11A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6Z" />
      <path d="M4 10h16" />
      <path d="M8 14h3M8 17h6" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M16 19a4 4 0 0 0-8 0" />
      <circle cx="12" cy="9" r="3.25" />
      <path d="M5 19a3 3 0 0 1 3-3" />
      <path d="M19 19a3 3 0 0 0-3-3" />
      <path d="M6.75 10.25a2.25 2.25 0 1 1 .02-4.5" />
      <path d="M17.25 10.25a2.25 2.25 0 1 0-.02-4.5" />
    </svg>
  );
}

function SignInIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M10 7V5.5A1.5 1.5 0 0 1 11.5 4h6A1.5 1.5 0 0 1 19 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 10 18.5V17" />
      <path d="M4 12h10" />
      <path d="m10 8 4 4-4 4" />
    </svg>
  );
}

export function App() {
  const initialConfirmationOrderId = getConfirmationOrderIdFromLocation();
  const initialToken = localStorage.getItem(sessionTokenKey) ?? '';
  const accountShellRef = useRef<HTMLDivElement | null>(null);
  const [route, setRoute] = useState<RouteKey>(initialConfirmationOrderId ? 'confirmation' : getRouteFromHash());
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [token, setToken] = useState(initialToken);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(Boolean(initialToken));
  const [accountMessage, setAccountMessage] = useState('');
  const [confirmationOrderId, setConfirmationOrderId] = useState(initialConfirmationOrderId);
  const [isHatAnimating, setIsHatAnimating] = useState(false);
  const isAdmin = user?.role === 'admin';
  const isScanner = user?.role === 'scanner' || isAdmin;
  const canViewTicketSales = isScanner;
  const routeTitle = getRouteTitle(route);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setIsCheckingSession(false);
      return;
    }

    let isCurrent = true;
    setIsCheckingSession(true);

    getCurrentUser(token)
      .then((result) => {
        if (isCurrent) setUser(result.user);
      })
      .catch(() => {
        if (!isCurrent) return;
        localStorage.removeItem(sessionTokenKey);
        setToken('');
        setUser(null);
      })
      .finally(() => {
        if (isCurrent) setIsCheckingSession(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [token]);

  useEffect(() => {
    function handleHashChange() {
      if (getConfirmationOrderIdFromLocation()) return;

      setRoute(getRouteFromHash());
    }

    window.addEventListener('hashchange', handleHashChange);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  useEffect(() => {
    if (isCheckingSession) return;

    if (route === 'scan' && !isScanner) {
      setRouteAndSyncUrl(user ? 'myTickets' : 'home');
    } else if (route === 'adminEvents' && !isAdmin) {
      setRouteAndSyncUrl('home');
    } else if (route === 'adminUsers' && !isAdmin) {
      setRouteAndSyncUrl('home');
    } else if (route === 'sales' && !canViewTicketSales) {
      setRouteAndSyncUrl('home');
    } else if (route === 'guestCheckout' && user) {
      setRouteAndSyncUrl('home');
    } else if (route === 'createAccount' && user) {
      setRouteAndSyncUrl('home');
    } else if (route === 'account' && !user) {
      setRouteAndSyncUrl('auth');
    } else if (route === 'myTickets' && !user) {
      setRouteAndSyncUrl('auth');
    }
  }, [canViewTicketSales, isAdmin, isCheckingSession, isScanner, route, user]);

  const currentView = useMemo(() => {
    const homePage = <HomePage token={token} user={user} onCreateAccount={() => navigate('createAccount')} onContinueAsGuest={() => navigate('guestCheckout')} />;

    if (route === 'auth') return <AuthPage onSession={handleSession} />;
    if (route === 'createAccount') return <AuthPage initialMode="create" onSession={handleSession} />;
    if (route === 'guestCheckout') return user ? homePage : <GuestCheckoutPage />;
    if (route === 'account') {
      return token ? <AccountPage token={token} user={user} onUserChange={handleUserChange} onAccountDeleted={handleAccountDeleted} /> : <AuthPage onSession={handleSession} />;
    }
    if (route === 'adminUsers') {
      return token && isAdmin ? <AdminUsersPage token={token} currentUser={user} onCurrentUserUpdated={handleAdminUserUpdated} /> : homePage;
    }
    if (route === 'adminEvents') {
      return token && isAdmin ? <AdminEventsPage token={token} /> : homePage;
    }
    if (route === 'myTickets') return token ? <MyTicketsPage token={token} /> : <AuthPage onSession={handleSession} />;
    if (route === 'scan') return <ScanPage token={token} user={user} onViewOrder={openConfirmationOrder} />;
    if (route === 'sales') return <SalesPage token={token} />;
    if (route === 'confirmation') {
      return confirmationOrderId ? <ConfirmationPage orderId={confirmationOrderId} token={token} user={user} onBackToSales={() => setRouteAndSyncUrl('sales')} /> : homePage;
    }
    return homePage;
  }, [confirmationOrderId, handleAccountDeleted, handleAdminUserUpdated, handleSession, handleUserChange, isAdmin, openConfirmationOrder, route, token, user]);

  function setRouteAndSyncUrl(nextRoute: RouteKey) {
    setRoute(nextRoute);

    if (nextRoute !== 'confirmation') {
      setConfirmationOrderId('');
      syncConfirmationOrderId('');
      syncRouteHash(nextRoute);
    }
  }

  function openConfirmationOrder(orderId: string) {
    setConfirmationOrderId(orderId);
    setRoute('confirmation');

    const url = new URL(window.location.href);
    url.searchParams.set('order', orderId);
    url.hash = '';
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);

    setMenuOpen(false);
    setAccountOpen(false);
  }

  function navigate(nextRoute: RouteKey) {
    setRouteAndSyncUrl(nextRoute);
    setMenuOpen(false);
    setAccountOpen(false);
  }

  function handleMenuButtonClick() {
    setMenuOpen(true);
  }

  function handleAccountButtonClick() {
    if (!user) {
      navigate('auth');
      return;
    }

    setAccountOpen((open) => !open);
  }

  function handleSession(nextToken: string, nextUser: SessionUser) {
    localStorage.setItem(sessionTokenKey, nextToken);
    setToken(nextToken);
    setUser(nextUser);
    setIsCheckingSession(false);
    setAccountMessage(`Signed in as ${nextUser.displayName}.`);
    setRouteAndSyncUrl('home');
  }

  function handleUserChange(nextUser: SessionUser) {
    setUser(nextUser);
  }

  function handleAdminUserUpdated(updatedUser: AdminManagedUser) {
    setUser((currentUser) => {
      if (!currentUser || currentUser.id !== updatedUser.id) {
        return currentUser;
      }

      if (!updatedUser.isActive) {
        return currentUser;
      }

      return {
        ...currentUser,
        email: updatedUser.email,
        displayName: updatedUser.displayName,
        role: updatedUser.role,
      };
    });

    if (user?.id !== updatedUser.id) {
      return;
    }

    if (!updatedUser.isActive) {
      clearSession('Your account was deactivated.');
      return;
    }

    setAccountMessage('Your access level was updated.');
  }

  function clearSession(message: string) {
    localStorage.removeItem(sessionTokenKey);
    setToken('');
    setUser(null);
    setIsCheckingSession(false);
    setAccountMessage(message);
    setAccountOpen(false);
    if (route !== 'home') setRouteAndSyncUrl('home');
  }

  function handleAccountDeleted() {
    clearSession('Account deleted.');
  }

  function signOut() {
    clearSession('Signed out.');
  }

  function handleHatClick() {
    if (isHatAnimating) {
      setIsHatAnimating(false);
      requestAnimationFrame(() => setIsHatAnimating(true));
      return;
    }

    setIsHatAnimating(true);
  }

  return (
    <div className={`app-shell${route === 'scan' ? ' app-shell-scanner' : ''}`}>
      <header className="app-header">
        <div className="app-header-leading">
          <button className="icon-button" type="button" aria-label="Open menu" onClick={handleMenuButtonClick}>
            <MenuIcon />
          </button>
          <button
            aria-label="Animate logo"
            className={`brand-mark-button${isHatAnimating ? ' is-animating' : ''}`}
            type="button"
            onAnimationEnd={() => setIsHatAnimating(false)}
            onClick={handleHatClick}
          >
            <WizardHatMark />
          </button>
        </div>
        <div className="app-title" aria-live="polite">
          <span>{routeTitle}</span>
        </div>
        <div className="account-shell" ref={accountShellRef}>
          <button
            className="icon-button"
            type="button"
            aria-label={user ? 'Account' : 'Sign in'}
            onClick={handleAccountButtonClick}
          >
            <AccountIcon />
          </button>
          {user && accountOpen ? (
            <aside className="account-menu" aria-label="Account menu">
              <>
                <div className="account-summary">
                  <strong>{user.displayName}</strong>
                  <span>{user.email}</span>
                  {user.role !== 'customer' ? <span>{user.role}</span> : null}
                </div>
                <div className="account-menu-actions">
                  <button className="account-menu-button" type="button" onClick={() => navigate('account')}>
                    <SettingsIcon />
                    <span>Account Settings</span>
                  </button>
                  <button className="account-menu-button" type="button" onClick={signOut}>
                    <SignInIcon />
                    <span>Sign Out</span>
                  </button>
                </div>
                {accountMessage ? <p className="status-text">{accountMessage}</p> : null}
              </>
            </aside>
          ) : null}
        </div>
      </header>
      {user && accountOpen ? <button className="drawer-backdrop" type="button" aria-label="Close account menu" onClick={() => setAccountOpen(false)} /> : null}
      {menuOpen ? <button className="drawer-backdrop" type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} /> : null}
      <aside className={`side-drawer${menuOpen ? ' is-open' : ''}`} aria-label="Primary menu" aria-hidden={!menuOpen}>
        <div className="drawer-header">
          <strong>Menu</strong>
          <button className="drawer-close-button" type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
            <CloseIcon />
          </button>
        </div>
        <nav className="drawer-nav">
          <DrawerItem active={route === 'home'} icon={<HomeIcon />} onClick={() => navigate('home')}>
            Home
          </DrawerItem>
          {user ? (
            <DrawerItem active={route === 'myTickets'} icon={<TicketIcon />} onClick={() => navigate('myTickets')}>
              My Tickets
            </DrawerItem>
          ) : (
            <DrawerItem active={route === 'auth' || route === 'createAccount'} icon={<SignInIcon />} onClick={() => navigate('auth')}>
              Sign In
            </DrawerItem>
          )}
          {isScanner ? (
            <DrawerItem active={route === 'scan'} icon={<ScanIcon />} onClick={() => navigate('scan')}>
              Scan
            </DrawerItem>
          ) : null}
          {canViewTicketSales ? (
            <DrawerItem active={route === 'sales'} icon={<SalesIcon />} onClick={() => navigate('sales')}>
              Sales
            </DrawerItem>
          ) : null}
          {isAdmin ? (
            <DrawerItem active={route === 'adminEvents'} icon={<CalendarIcon />} onClick={() => navigate('adminEvents')}>
              Events
            </DrawerItem>
          ) : null}
          {isAdmin ? (
            <DrawerItem active={route === 'adminUsers'} icon={<UsersIcon />} onClick={() => navigate('adminUsers')}>
              User Access
            </DrawerItem>
          ) : null}
        </nav>
      </aside>
      <main>
        <Suspense fallback={<LoadingOverlay label="Loading page" detail="Bringing in the next screen." variant={getRouteLoadingVariant(route)} />}>{currentView}</Suspense>
      </main>
      {isCheckingSession ? <LoadingOverlay label="Restoring session" detail="Checking your saved sign-in." variant={getRouteLoadingVariant(route)} /> : null}
    </div>
  );
}

