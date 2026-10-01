import { getCountries, getCountryCallingCode } from 'libphonenumber-js/min';

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
