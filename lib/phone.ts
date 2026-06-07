export function toTenDigitPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits.slice(0, 10);
}

export function toIndiaPhone(value: string) {
  const phone = toTenDigitPhone(value);
  return phone ? `+91${phone}` : '';
}
