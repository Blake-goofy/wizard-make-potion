export function normalizeSmsPhone(phoneNumber: string) {
  const digits = phoneNumber.replace(/\D/g, '');
  // ponytail: this app supports US/NANP numbers only. Add explicit country support before accepting international numbers.
  if (/^\d{10}$/.test(digits) && !phoneNumber.trim().startsWith('+')) return `+1${digits}`;
  if (/^1\d{10}$/.test(digits)) return `+${digits}`;
  throw Object.assign(new Error('A US phone number is required.'), { statusCode: 400 });
}
