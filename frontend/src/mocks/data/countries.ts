export interface Country {
  code: string;
  name: string;
  dialCode: string;
  flag: string;
}

export const countries: Country[] = [
  { code: "US", name: "United States", dialCode: "+1", flag: "US" },
  { code: "GB", name: "United Kingdom", dialCode: "+44", flag: "GB" },
  { code: "CA", name: "Canada", dialCode: "+1", flag: "CA" },
  { code: "AU", name: "Australia", dialCode: "+61", flag: "AU" },
  { code: "DE", name: "Germany", dialCode: "+49", flag: "DE" },
  { code: "FR", name: "France", dialCode: "+33", flag: "FR" },
  { code: "NL", name: "Netherlands", dialCode: "+31", flag: "NL" },
  { code: "CH", name: "Switzerland", dialCode: "+41", flag: "CH" },
  { code: "SE", name: "Sweden", dialCode: "+46", flag: "SE" },
  { code: "IE", name: "Ireland", dialCode: "+353", flag: "IE" },
  { code: "JP", name: "Japan", dialCode: "+81", flag: "JP" },
  { code: "SG", name: "Singapore", dialCode: "+65", flag: "SG" },
  { code: "HK", name: "Hong Kong", dialCode: "+852", flag: "HK" },
  { code: "IN", name: "India", dialCode: "+91", flag: "IN" },
  { code: "IL", name: "Israel", dialCode: "+972", flag: "IL" },
  { code: "AE", name: "United Arab Emirates", dialCode: "+971", flag: "AE" },
  { code: "BR", name: "Brazil", dialCode: "+55", flag: "BR" },
  { code: "MX", name: "Mexico", dialCode: "+52", flag: "MX" },
];

export function getCountryByCode(code: string): Country | undefined {
  return countries.find((c) => c.code === code);
}

export function getCountryByDialCode(dialCode: string): Country | undefined {
  return countries.find((c) => c.dialCode === dialCode);
}
