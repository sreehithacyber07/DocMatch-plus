import { getCountries, getCountryCallingCode, type CountryCode } from 'libphonenumber-js/min';

/** The optional contact as typed: a calling-code country and the digits. */
export interface PhoneValue {
  country: CountryCode;
  number: string;
}

export const EMPTY_PHONE: PhoneValue = { country: 'IN', number: '' };

const names = new Intl.DisplayNames(['en'], { type: 'region' });

export const countries = getCountries().map((iso) => ({
  iso,
  name: names.of(iso) ?? iso,
  dial: `+${getCountryCallingCode(iso)}`,
})).sort((a, b) => a.name.localeCompare(b.name));

export function searchCallingCodes(query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return countries;
  return countries.filter((country) =>
    country.name.toLowerCase().includes(needle)
    || country.iso.toLowerCase().includes(needle)
    || country.dial.includes(needle),
  );
}
