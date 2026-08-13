import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import type { AdminManagedUser, SessionUser } from '@potion/shared';
import LoadingOverlay, { type LoadingSkeletonVariant } from './components/LoadingOverlay';
import { HomePage } from './routes/HomePage';
import { WizardHatMark } from './components/WizardHatMark';
import { getCurrentUser } from './lib/api';

const routeImportReloadStorageKey = 'wizard-route-import-reload';

function getImportErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === 'string' ? error : '';
}

function getDynamicImportErrorFingerprint(error: unknown) {
  const message = getImportErrorMessage(error);

  if (
    !message ||
    (!message.includes('Failed to fetch dynamically imported module') &&
      !message.includes('Importing a module script failed') &&
      !/Loading chunk [\w-]+ failed/i.test(message))
  ) {
    return null;
  }

  const moduleUrlMatch = message.match(/https?:\/\/\S+|\/assets\/[^\s)]+/i);

  return moduleUrlMatch?.[0] ?? `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function lazyRoute<TModule extends { default: ComponentType<any> }>(load: () => Promise<TModule>) {
  return lazy(async () => {
    const module = await load();
    sessionStorage.removeItem(routeImportReloadStorageKey);
    return module;
  });
}

class RouteErrorBoundary extends Component<
  { children: ReactNode; fallbackVariant: LoadingSkeletonVariant },
  { error: unknown; isRefreshing: boolean }
> {
  override state = { error: null, isRefreshing: false };

  static getDerivedStateFromError(error: unknown) {
    return { error, isRefreshing: false };
  }

  override componentDidCatch(error: unknown) {
    const fingerprint = getDynamicImportErrorFingerprint(error);

    if (!fingerprint || sessionStorage.getItem(routeImportReloadStorageKey) === fingerprint) {
      return;
    }

    sessionStorage.setItem(routeImportReloadStorageKey, fingerprint);
    this.setState({ error, isRefreshing: true }, () => {
      window.location.reload();
    });
  }

  override render() {
    if (!this.state.error) {
      return this.props.children;
    }

    if (this.state.isRefreshing) {
      return <LoadingOverlay label="Refreshing app" detail="Loading the latest version of this page." variant={this.props.fallbackVariant} />;
    }

    const isDynamicImportFailure = getDynamicImportErrorFingerprint(this.state.error) !== null;

    return (
      <section className="content-panel loading-page-shell" role="alert" aria-live="polite">
        <h1>{isDynamicImportFailure ? 'Refresh required' : 'Page unavailable'}</h1>
        <p className="status-text">
          {isDynamicImportFailure
            ? 'This screen changed while your tab was open. Refresh to load the latest files.'
            : 'Something went wrong while loading this screen. Refresh and try again.'}
        </p>
        <button className="primary-button" type="button" onClick={() => window.location.reload()}>
          Refresh page
        </button>
      </section>
    );
  }
}

const AccountPage = lazyRoute(() => import('./routes/AccountPage'));
const AboutPage = lazyRoute(() => import('./routes/AboutPage'));
const AdminEventsPage = lazyRoute(() => import('./routes/AdminEventsPage'));
const AdminMessagesPage = lazyRoute(() => import('./routes/AdminMessagesPage'));
const AdminUsersPage = lazyRoute(() => import('./routes/AdminUsersPage'));
const SalesPage = lazyRoute(() => import('./routes/SalesPage'));
const MyTicketsPage = lazyRoute(() => import('./routes/MyTicketsPage'));
const AuthPage = lazyRoute(() => import('./routes/AuthPage'));
const ConfirmationPage = lazyRoute(() => import('./routes/ConfirmationPage'));
const GuestCheckoutPage = lazyRoute(() => import('./routes/GuestCheckoutPage'));
const PrivacyPolicyPage = lazyRoute(() => import('./routes/PrivacyPolicyPage'));
const ScanPage = lazyRoute(() => import('./routes/ScanPage'));
const TermsPage = lazyRoute(() => import('./routes/TermsPage'));

type RouteKey = 'home' | 'event' | 'about' | 'myTickets' | 'account' | 'adminEvents' | 'adminMessages' | 'adminUsers' | 'auth' | 'createAccount' | 'guestCheckout' | 'privacyPolicy' | 'terms' | 'scan' | 'sales' | 'confirmation';
type ConfirmationOrigin = 'home' | 'myTickets' | 'scan' | 'sales';
type PublicRouteKey = Exclude<RouteKey, 'event' | 'guestCheckout' | 'confirmation'>;

const sessionTokenKey = 'sessionToken';
const routePathByKey: Record<PublicRouteKey, string> = {
  home: '/events',
  about: '/about',
  myTickets: '/my-tickets',
  account: '/account',
  adminEvents: '/admin/events',
  adminMessages: '/admin/messages',
  adminUsers: '/admin/users',
  auth: '/sign-in',
  createAccount: '/create-account',
  privacyPolicy: '/privacy-policy',
  terms: '/terms-and-conditions',
  scan: '/scan',
  sales: '/sales',
};
const routeKeyByHash: Record<string, Exclude<RouteKey, 'confirmation'>> = {
  '': 'home',
  home: 'home',
  tickets: 'home',
  'my-tickets': 'myTickets',
  account: 'account',
  about: 'about',
  'admin-events': 'adminEvents',
  events: 'home',
  'admin-messages': 'adminMessages',
  messages: 'adminMessages',
  'admin-users': 'adminUsers',
  users: 'adminUsers',
  'sign-in': 'auth',
  'create-account': 'createAccount',
  'guest-checkout': 'guestCheckout',
  checkout: 'guestCheckout',
  privacy: 'privacyPolicy',
  'privacy-policy': 'privacyPolicy',
  terms: 'terms',
  'terms-and-conditions': 'terms',
  scan: 'scan',
  scanner: 'scan',
  sales: 'sales',
  'ticket-sales': 'sales',
};

const routeKeyByPath: Record<string, PublicRouteKey> = Object.fromEntries(
  Object.entries(routePathByKey).map(([key, path]) => [path, key]),
) as Record<string, PublicRouteKey>;

function getConfirmationOrderIdFromLocation() {
  return new URLSearchParams(window.location.search).get('order') ?? '';
}

function getConfirmationOriginFromLocation(): ConfirmationOrigin {
  const origin = new URLSearchParams(window.location.search).get('from');

  if (origin === 'myTickets' || origin === 'scan' || origin === 'sales') {
    return origin;
  }

  return 'home';
}

function syncConfirmationLocation(orderId: string, origin: ConfirmationOrigin) {
  const url = orderId ? new URL('/confirmation', window.location.origin) : new URL(window.location.href);

  if (orderId) {
    url.searchParams.set('order', orderId);
    if (origin === 'home') {
      url.searchParams.delete('from');
    } else {
      url.searchParams.set('from', origin);
    }
  } else {
    url.searchParams.delete('order');
    url.searchParams.delete('from');
  }

  window.history.replaceState({}, '', `${url.pathname}${url.search}`);
}

function getConfirmationBackRoute(origin: ConfirmationOrigin): Exclude<RouteKey, 'confirmation'> {
  if (origin === 'myTickets') return 'myTickets';
  if (origin === 'scan') return 'scan';
  if (origin === 'sales') return 'sales';
  return 'home';
}

function getConfirmationBackLabel(origin: ConfirmationOrigin) {
  if (origin === 'myTickets') return 'Back to my tickets';
  if (origin === 'scan') return 'Back to scan';
  if (origin === 'sales') return 'Back to sales';
  return 'Back to home';
}

function getRouteFromLocation() {
  const hash = window.location.hash.replace(/^#/, '').toLowerCase();
  if (hash) return { route: routeKeyByHash[hash] ?? 'home' as RouteKey, eventSlug: '' };

  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const eventCheckoutMatch = path.match(/^\/events\/([^/]+)\/guest-checkout$/);
  const eventMatch = path.match(/^\/events\/([^/]+)$/);
  const queryEventSlug = new URLSearchParams(window.location.search).get('event') ?? '';

  if (eventCheckoutMatch) return { route: 'guestCheckout' as RouteKey, eventSlug: decodePathSegment(eventCheckoutMatch[1]) };
  if (eventMatch) return { route: 'event' as RouteKey, eventSlug: decodePathSegment(eventMatch[1]) };
  if (path === '/' || path === '/events') return { route: 'home' as RouteKey, eventSlug: '' };

  return { route: routeKeyByPath[path] ?? 'home' as RouteKey, eventSlug: queryEventSlug };
}

function decodePathSegment(value: string | undefined) {
  try {
    return decodeURIComponent(value ?? '');
  } catch {
    return '';
  }
}

function syncRouteLocation(route: RouteKey, eventSlug = '', historyMode: 'push' | 'replace' = 'replace') {
  if (route === 'confirmation') return;

  const path = route === 'event'
    ? `/events/${encodeURIComponent(eventSlug)}`
    : route === 'guestCheckout' && eventSlug
      ? `/events/${encodeURIComponent(eventSlug)}/guest-checkout`
      : route === 'guestCheckout'
        ? '/guest-checkout'
        : routePathByKey[route];
  const search = route === 'createAccount' && eventSlug ? `?event=${encodeURIComponent(eventSlug)}` : '';

  window.history[`${historyMode}State`]({}, '', `${path}${search}`);
}

function getRouteLoadingVariant(route: RouteKey): LoadingSkeletonVariant {
  if (route === 'home' || route === 'event') return 'purchase';
  if (route === 'about') return 'purchase';
  if (route === 'myTickets') return 'tickets';
  if (route === 'scan') return 'scanner';
  if (route === 'adminEvents') return 'account';
  if (route === 'adminMessages') return 'account';
  if (route === 'adminUsers') return 'account';
  if (route === 'createAccount') return 'auth';
  if (route === 'guestCheckout') return 'purchase';
  if (route === 'privacyPolicy') return 'purchase';
  if (route === 'terms') return 'purchase';
  return route;
}

function getRouteTitle(route: RouteKey) {
  if (route === 'home') return 'Events';
  if (route === 'event') return 'Wizard Make Potion';
  if (route === 'about') return 'About';
  if (route === 'myTickets') return 'My Tickets';
  if (route === 'account') return 'Account';
  if (route === 'adminEvents') return 'Events';
  if (route === 'adminMessages') return 'Messages';
  if (route === 'adminUsers') return 'User Access';
  if (route === 'auth') return 'Sign In';
  if (route === 'createAccount') return 'Create Account';
  if (route === 'guestCheckout') return 'Checkout';
  if (route === 'privacyPolicy') return 'Privacy Policy';
  if (route === 'terms') return 'Terms and Conditions';
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

function NotificationIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'account-menu-notification-icon'} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle className="account-menu-notification-icon-circle" cx="12" cy="12" r="9" />
      <text className="account-menu-notification-icon-number" x="12" y="12" textAnchor="middle" dominantBaseline="central">
        1
      </text>
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

function AboutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10.5v6" />
      <path d="M12 7.5h.01" />
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

function MessageIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 6.5A1.5 1.5 0 0 1 6.5 5h11A1.5 1.5 0 0 1 19 6.5v7A1.5 1.5 0 0 1 17.5 15H10l-4 4v-4H6.5A1.5 1.5 0 0 1 5 13.5Z" />
      <path d="M8 8.5h8M8 11.5h5" />
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
  const initialRoute = getRouteFromLocation();
  const initialConfirmationOrderId = getConfirmationOrderIdFromLocation();
  const initialConfirmationOrigin = getConfirmationOriginFromLocation();
  const initialToken = localStorage.getItem(sessionTokenKey) ?? '';
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const sideDrawerRef = useRef<HTMLElement | null>(null);
  const accountShellRef = useRef<HTMLDivElement | null>(null);
  const [route, setRoute] = useState<RouteKey>(initialConfirmationOrderId ? 'confirmation' : initialRoute.route);
  const [eventSlug, setEventSlug] = useState(initialRoute.eventSlug);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [token, setToken] = useState(initialToken);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(Boolean(initialToken));
  const [accountMessage, setAccountMessage] = useState('');
  const [confirmationOrderId, setConfirmationOrderId] = useState(initialConfirmationOrderId);
  const [confirmationOrigin, setConfirmationOrigin] = useState<ConfirmationOrigin>(initialConfirmationOrigin);
  const [isHatAnimating, setIsHatAnimating] = useState(false);
  const isAdmin = user?.role === 'admin';
  const isScanner = user?.role === 'scanner' || isAdmin;
  const canViewTicketSales = isScanner;
  const needsPhoneVerification = Boolean(user?.phoneNumber && !user.phoneVerifiedAt);
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
    function handleLocationChange() {
      if (getConfirmationOrderIdFromLocation()) return;

      const nextRoute = getRouteFromLocation();
      setRoute(nextRoute.route);
      setEventSlug(nextRoute.eventSlug);
    }

    if (window.location.hash) syncRouteLocation(initialRoute.route, initialRoute.eventSlug);
    window.addEventListener('popstate', handleLocationChange);

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  useEffect(() => {
    if (isCheckingSession) return;

    if (route === 'scan' && !isScanner) {
      setRouteAndSyncUrl(user ? 'myTickets' : 'home');
    } else if (route === 'adminEvents' && !isAdmin) {
      setRouteAndSyncUrl('home');
    } else if (route === 'adminMessages' && !isAdmin) {
      setRouteAndSyncUrl('home');
    } else if (route === 'adminUsers' && !isAdmin) {
      setRouteAndSyncUrl('home');
    } else if (route === 'sales' && !canViewTicketSales) {
      setRouteAndSyncUrl('home');
    } else if (route === 'guestCheckout' && user) {
      setRouteAndSyncUrl(eventSlug ? 'event' : 'home', eventSlug);
    } else if (route === 'guestCheckout' && !eventSlug) {
      setRouteAndSyncUrl('home');
    } else if (route === 'createAccount' && user) {
      setRouteAndSyncUrl(eventSlug ? 'event' : 'home', eventSlug);
    } else if (route === 'account' && !user) {
      setRouteAndSyncUrl('auth');
    } else if (route === 'myTickets' && !user) {
      setRouteAndSyncUrl('auth');
    }
  }, [canViewTicketSales, eventSlug, isAdmin, isCheckingSession, isScanner, route, user]);

  const currentView = useMemo(() => {
    const homePage = (
      <HomePage
        token={token}
        user={user}
        eventSlug={route === 'event' ? eventSlug : undefined}
        onSelectEvent={(slug) => navigate('event', slug)}
        onCreateAccount={(slug) => navigate('createAccount', slug)}
        onContinueAsGuest={(slug) => navigate('guestCheckout', slug)}
      />
    );

    if (route === 'auth') return <AuthPage onSession={handleSession} />;
    if (route === 'createAccount') return <AuthPage initialMode="create" onSession={handleSession} />;
    if (route === 'guestCheckout') return user ? homePage : <GuestCheckoutPage eventSlug={eventSlug} />;
    if (route === 'about') return <AboutPage />;
    if (route === 'privacyPolicy') return <PrivacyPolicyPage />;
    if (route === 'terms') return <TermsPage />;
    if (route === 'account') {
      return token ? <AccountPage token={token} user={user} onUserChange={handleUserChange} onAccountDeleted={handleAccountDeleted} /> : <AuthPage onSession={handleSession} />;
    }
    if (route === 'adminUsers') {
      return token && isAdmin ? <AdminUsersPage token={token} currentUser={user} onCurrentUserUpdated={handleAdminUserUpdated} /> : homePage;
    }
    if (route === 'adminMessages') {
      return token && isAdmin ? <AdminMessagesPage token={token} currentUser={user} /> : homePage;
    }
    if (route === 'adminEvents') {
      return token && isAdmin ? <AdminEventsPage token={token} /> : homePage;
    }
    if (route === 'myTickets') return token ? <MyTicketsPage token={token} /> : <AuthPage onSession={handleSession} />;
    if (route === 'scan') return <ScanPage token={token} user={user} onViewOrder={(orderId: string) => openConfirmationOrder(orderId, 'scan')} />;
    if (route === 'sales') return <SalesPage token={token} />;
    if (route === 'confirmation') {
      return confirmationOrderId ? (
        <ConfirmationPage
          orderId={confirmationOrderId}
          token={token}
          user={user}
          backButtonLabel={getConfirmationBackLabel(confirmationOrigin)}
          onBack={() => setRouteAndSyncUrl(getConfirmationBackRoute(confirmationOrigin))}
        />
      ) : homePage;
    }
    return homePage;
  }, [confirmationOrderId, confirmationOrigin, eventSlug, handleAccountDeleted, handleAdminUserUpdated, handleSession, handleUserChange, isAdmin, openConfirmationOrder, route, token, user]);

  function setRouteAndSyncUrl(nextRoute: RouteKey, nextEventSlug = '', historyMode: 'push' | 'replace' = 'replace') {
    setRoute(nextRoute);
    setEventSlug(nextEventSlug);

    if (nextRoute !== 'confirmation') {
      setConfirmationOrderId('');
      setConfirmationOrigin('home');
      syncConfirmationLocation('', 'home');
      syncRouteLocation(nextRoute, nextEventSlug, historyMode);
    }
  }

  function openConfirmationOrder(orderId: string, origin: ConfirmationOrigin = 'home') {
    setConfirmationOrderId(orderId);
    setConfirmationOrigin(origin);
    setRoute('confirmation');

    const url = new URL('/confirmation', window.location.origin);
    url.searchParams.set('order', orderId);
    if (origin === 'home') {
      url.searchParams.delete('from');
    } else {
      url.searchParams.set('from', origin);
    }
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);

    setMenuOpen(false);
    setAccountOpen(false);
  }

  function navigate(nextRoute: RouteKey, nextEventSlug = '') {
    setRouteAndSyncUrl(nextRoute, nextEventSlug, 'push');
    closeMenu();
    setAccountOpen(false);
  }

  function closeMenu() {
    if (sideDrawerRef.current?.contains(document.activeElement)) {
      menuButtonRef.current?.focus();
    }

    setMenuOpen(false);
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
    setRouteAndSyncUrl(eventSlug ? 'event' : 'home', eventSlug);
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
          <button className="icon-button" type="button" aria-label="Open menu" onClick={handleMenuButtonClick} ref={menuButtonRef}>
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
            className="icon-button account-button"
            type="button"
            aria-label={user ? (needsPhoneVerification ? 'Account, phone verification needed' : 'Account') : 'Sign in'}
            onClick={handleAccountButtonClick}
          >
            <AccountIcon />
            {needsPhoneVerification ? <NotificationIcon className="account-button-badge" /> : null}
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
                    {needsPhoneVerification ? <NotificationIcon /> : <SettingsIcon />}
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
      {menuOpen ? <button className="drawer-backdrop" type="button" aria-label="Close menu" onClick={closeMenu} /> : null}
      <aside className={`side-drawer${menuOpen ? ' is-open' : ''}`} aria-label="Primary menu" aria-hidden={!menuOpen} ref={sideDrawerRef}>
        <div className="drawer-header">
          <strong>Menu</strong>
          <button className="drawer-close-button" type="button" aria-label="Close menu" onClick={closeMenu}>
            <CloseIcon />
          </button>
        </div>
        <nav className="drawer-nav">
          <DrawerItem active={route === 'home' || route === 'event'} icon={<HomeIcon />} onClick={() => navigate('home')}>
            Events
          </DrawerItem>
          <DrawerItem active={route === 'about'} icon={<AboutIcon />} onClick={() => navigate('about')}>
            About
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
            <DrawerItem active={route === 'adminMessages'} icon={<MessageIcon />} onClick={() => navigate('adminMessages')}>
              Messages
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
        <RouteErrorBoundary key={route} fallbackVariant={getRouteLoadingVariant(route)}>
          <Suspense fallback={<LoadingOverlay label="Loading page" detail="Bringing in the next screen." variant={getRouteLoadingVariant(route)} />}>{currentView}</Suspense>
        </RouteErrorBoundary>
      </main>
      {route !== 'scan' ? (
        <footer className="legal-footer app-footer" aria-label="Legal links">
          <a href="/about" onClick={(event) => { event.preventDefault(); navigate('about'); }}>About</a>
          <span aria-hidden="true">|</span>
          <a href="/privacy-policy" onClick={(event) => { event.preventDefault(); navigate('privacyPolicy'); }}>Privacy Policy</a>
          <span aria-hidden="true">|</span>
          <a href="/terms-and-conditions" onClick={(event) => { event.preventDefault(); navigate('terms'); }}>Terms and Conditions</a>
        </footer>
      ) : null}
      {isCheckingSession ? <LoadingOverlay label="Restoring session" detail="Checking your saved sign-in." variant={getRouteLoadingVariant(route)} /> : null}
    </div>
  );
}

