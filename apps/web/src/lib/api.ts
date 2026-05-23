import type {
  AccountProfile,
  AdminEventCreateInput,
  AdminEventUpdateInput,
  AdminManagedUser,
  AdminUserUpdateInput,
  ChangePasswordInput,
  CreateAccountInput,
  CreateOrderInput,
  LoginInput,
  LoginResponse,
  RequestPasswordResetInput,
  ResetPasswordInput,
  ScanEventAttendance,
  ScannerSettings,
  ScanTicketDetail,
  ScanTicketInput,
  ScanTicketResult,
  SessionUser,
  UpdateAccountInput,
  UpdateTicketUsageInput,
  VerifyAccountInput,
} from '@potion/shared';

export type EventView = {
  id: string;
  slug: string;
  name: string;
  startsAt: string;
  address: string;
  description: string | null;
  ticketPriceCents: number;
  taxRateBps: number;
  minTicketsPerOrder: number;
  maxTicketsPerOrder: number;
  isActive: boolean;
};

export type TicketView = {
  id: string;
  ticketNumber: number;
  scanToken: string;
  usedAt: string | null;
};

export type QuoteView = {
  quantity: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
};

export type DevOrderResult = {
  orderId: string;
  event: EventView;
  quote: QuoteView;
  tickets: TicketView[];
};

export type StripeCheckoutResult = {
  orderId: string;
  checkoutUrl: string;
};

export type AdminTicketView = {
  id: string;
  orderId: string;
  ticketNumber: number;
  usedAt: string | null;
  customerDisplayName: string | null;
  customerEmail: string;
  totalCents: number;
  createdAt: string;
  eventName: string;
  eventStartsAt: string;
  scanToken: string;
};

export type ScannerSettingsView = ScannerSettings;

export type AccountTicketView = {
  id: string;
  ticketNumber: number;
  scanToken: string;
  usedAt: string | null;
};

export type AccountOrderView = {
  id: string;
  customerEmail: string;
  quantity: number;
  totalCents: number;
  status: string;
  createdAt: string;
  eventName: string;
  eventStartsAt: string;
  tickets: AccountTicketView[];
};

export type ConfirmationTicketView = {
  id: string;
  ticketNumber: number;
  scanToken: string;
  usedAt: string | null;
};

export type ConfirmationOrderView = {
  id: string;
  customerEmail: string;
  quantity: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  status: string;
  createdAt: string;
  eventName: string;
  eventStartsAt: string;
  eventAddress: string;
  tickets: ConfirmationTicketView[];
};

const apiBaseUrl = resolveApiBaseUrl();

function resolveApiBaseUrl() {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

  if (!configuredBaseUrl) return '';

  return configuredBaseUrl.endsWith('/')
    ? configuredBaseUrl.slice(0, -1)
    : configuredBaseUrl;
}

function buildApiUrl(path: string) {
  return apiBaseUrl ? `${apiBaseUrl}${path}` : path;
}

async function getRequestErrorMessage(response: Response) {
  const fallbackMessages: Record<number, string> = {
    400: 'The request could not be completed. Please check your details and try again.',
    401: 'Your sign-in details were not accepted. Please try again.',
    403: 'You do not have permission to do that.',
    404: 'The requested resource could not be found.',
    409: 'That action could not be completed because the record already exists or has changed.',
    429: 'Too many attempts. Please wait a moment and try again.',
    500: 'Something went wrong on the server. Please try again.',
  };

  const fallbackMessage = fallbackMessages[response.status] ?? 'Something went wrong. Please try again.';
  const contentType = response.headers.get('Content-Type') ?? '';

  if (contentType.includes('application/json')) {
    try {
      const payload = (await response.json()) as { message?: unknown };

      if (typeof payload.message === 'string' && payload.message.trim().length > 0) {
        return payload.message;
      }
    } catch {
      return fallbackMessage;
    }
  }

  try {
    const text = (await response.text()).trim();

    if (text.length > 0) {
      return text;
    }
  } catch {
    return fallbackMessage;
  }

  return fallbackMessage;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(await getRequestErrorMessage(response));
  }

  return response.json() as Promise<T>;
}

export function getActiveEvent() {
  return request<{ event: EventView | null }>('/api/events/active');
}

export function createDevOrder(input: CreateOrderInput, token?: string | null) {
  return request<DevOrderResult>('/api/orders/dev-complete', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: JSON.stringify(input),
  });
}

export function createStripeCheckout(input: CreateOrderInput, checkoutAttemptId = crypto.randomUUID(), token?: string | null) {
  return request<StripeCheckoutResult>('/api/payments/stripe-checkout', {
    method: 'POST',
    headers: {
      'Idempotency-Key': checkoutAttemptId,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input),
  });
}

export function loginUser(input: LoginInput) {
  return request<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function createAccount(input: CreateAccountInput) {
  return request<{ email: string; message: string }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function verifyAccount(input: VerifyAccountInput) {
  return request<LoginResponse>('/api/auth/verify', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function requestPasswordReset(input: RequestPasswordResetInput) {
  return request<{ email: string; message: string }>('/api/auth/password-reset/request', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function confirmPasswordReset(input: ResetPasswordInput) {
  return request<{ reset: true }>('/api/auth/password-reset/confirm', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getCurrentUser(token: string) {
  return request<{ user: SessionUser }>('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getAccountProfile(token: string) {
  return request<{ account: AccountProfile }>('/api/account', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function updateAccount(input: UpdateAccountInput, token: string) {
  return request<{ account: AccountProfile }>('/api/account', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
}

export function changePassword(input: ChangePasswordInput, token: string) {
  return request<{ changed: true }>('/api/account/password', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
}

export function deleteAccount(token: string) {
  return request<{ deleted: true }>('/api/account', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function scanTicket(input: ScanTicketInput, token: string) {
  return request<ScanTicketResult>('/api/scanner/scan', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
}

export function getScannerEvents(token: string) {
  return request<{ events: EventView[] }>('/api/scanner/events', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getScannerSettings(token: string) {
  return request<{ settings: ScannerSettingsView }>('/api/scanner/settings', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getScannerAttendance(eventId: string, token: string) {
  return request<{ attendance: ScanEventAttendance }>(`/api/scanner/events/${eventId}/attendance`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getAccountOrders(token: string) {
  return request<{ orders: AccountOrderView[] }>('/api/account/orders', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getAdminTickets(token: string, eventId?: string) {
  const search = eventId ? `?${new URLSearchParams({ eventId }).toString()}` : '';

  return request<{ tickets: AdminTicketView[] }>(`/api/admin/tickets${search}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getAdminUsers(token: string) {
  return request<{ users: AdminManagedUser[] }>('/api/admin/users', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getAdminEvents(token: string) {
  return request<{ events: EventView[] }>('/api/admin/events', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function createAdminEvent(input: AdminEventCreateInput, token: string) {
  return request<{ event: EventView }>('/api/admin/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
}

export function updateAdminEvent(eventId: string, input: AdminEventUpdateInput, token: string) {
  return request<{ event: EventView }>(`/api/admin/events/${eventId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
}

export function updateAdminUser(userId: string, input: AdminUserUpdateInput, token: string) {
  return request<{ user: AdminManagedUser }>(`/api/admin/users/${userId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
}

export function updateTicketUsage(ticketId: string, input: UpdateTicketUsageInput, token: string) {
  return request<{ ticket: ScanTicketDetail; attendance: ScanEventAttendance }>(`/api/admin/tickets/${ticketId}/usage`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
}

export function getOrderConfirmation(orderId: string) {
  return request<{ order: ConfirmationOrderView }>(`/api/orders/${orderId}/confirmation`);
}
