const guestCheckoutContactStorageKey = 'guestCheckoutContact';

type GuestCheckoutContact = {
  orderId: string;
  phoneNumber: string;
};

export function saveGuestCheckoutContact(contact: GuestCheckoutContact) {
  try {
    window.sessionStorage.setItem(guestCheckoutContactStorageKey, JSON.stringify(contact));
  } catch {
    // ponytail: Prefill is best-effort when browser storage is unavailable; checkout must still continue.
  }
}

export function getGuestCheckoutPhoneNumber(orderId: string) {
  try {
    const value = window.sessionStorage.getItem(guestCheckoutContactStorageKey);
    if (!value) return '';

    const contact = JSON.parse(value) as Partial<GuestCheckoutContact>;

    return contact.orderId === orderId && typeof contact.phoneNumber === 'string'
      ? contact.phoneNumber
      : '';
  } catch {
    return '';
  }
}
