const ONES = [
  "",
  "ONE",
  "TWO",
  "THREE",
  "FOUR",
  "FIVE",
  "SIX",
  "SEVEN",
  "EIGHT",
  "NINE",
];

const TEENS = [
  "TEN",
  "ELEVEN",
  "TWELVE",
  "THIRTEEN",
  "FOURTEEN",
  "FIFTEEN",
  "SIXTEEN",
  "SEVENTEEN",
  "EIGHTEEN",
  "NINETEEN",
];

const TENS = [
  "",
  "",
  "TWENTY",
  "THIRTY",
  "FORTY",
  "FIFTY",
  "SIXTY",
  "SEVENTY",
  "EIGHTY",
  "NINETY",
];

function under100(n) {
  if (n < 10) return ONES[n];
  if (n < 20) return TEENS[n - 10];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return TENS[t] + (o ? `-${ONES[o]}` : "");
}

function under1000(n) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  let s = "";
  if (h) s += `${ONES[h]} HUNDRED`;
  if (r) s += (s ? " " : "") + under100(r);
  return s;
}

/**
 * @param {number} n non-negative integer
 */
function integerToWords(n) {
  if (n === 0) return "ZERO";
  const parts = [];
  let x = n;
  const billions = Math.floor(x / 1e9);
  x %= 1e9;
  const millions = Math.floor(x / 1e6);
  x %= 1e6;
  const thousands = Math.floor(x / 1000);
  const rest = x % 1000;
  if (billions) parts.push(`${under1000(billions)} BILLION`);
  if (millions) parts.push(`${under1000(millions)} MILLION`);
  if (thousands) parts.push(`${under1000(thousands)} THOUSAND`);
  if (rest) parts.push(under1000(rest));
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * @param {number} amount
 * @returns {string} e.g. "$23,545.00"
 */
export function formatUsd(amount) {
  const n = Math.round(amount * 100) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

/**
 * @param {number} amount
 * @returns {string} e.g. "TWENTY-THREE THOUSAND FIVE HUNDRED FORTY-FIVE DOLLARS AND ZERO CENTS"
 */
export function usdAmountToWords(amount) {
  const cents = Math.round(Math.abs(amount) * 100) % 100;
  const dollars = Math.floor(Math.abs(amount) + 1e-9);
  const dWords = integerToWords(dollars);
  const cWords = cents === 0 ? "ZERO" : under100(cents);
  const centUnit = cents === 1 ? "CENT" : "CENTS";
  return `${dWords} DOLLARS AND ${cWords} ${centUnit}`;
}
