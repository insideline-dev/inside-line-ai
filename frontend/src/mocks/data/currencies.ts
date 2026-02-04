export interface Currency {
  code: string;
  name: string;
  symbol: string;
}

export const currencies: Currency[] = [
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "E" },
  { code: "GBP", name: "British Pound", symbol: "L" },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF" },
  { code: "JPY", name: "Japanese Yen", symbol: "Y" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$" },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$" },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$" },
  { code: "INR", name: "Indian Rupee", symbol: "Rs" },
  { code: "ILS", name: "Israeli Shekel", symbol: "Sh" },
  { code: "AED", name: "UAE Dirham", symbol: "AED" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$" },
  { code: "MXN", name: "Mexican Peso", symbol: "Mex$" },
];

export function getCurrencyByCode(code: string): Currency | undefined {
  return currencies.find((c) => c.code === code);
}

export function formatCurrencySymbol(code: string): string {
  const currency = getCurrencyByCode(code);
  return currency?.symbol || code;
}
