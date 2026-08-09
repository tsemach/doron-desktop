// Mirrors apps/backend/lib/validation.ts -- kept as a separate copy rather
// than a shared module since apps/office's admin-creation rules could
// reasonably diverge from apps/backend's customer-signup rules later.

import { LOGIN_PASSWORD_LENGTH } from "@workspace/ui";

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidPasswordLength(password: string): boolean {
  return password.length >= 6 && password.length <= LOGIN_PASSWORD_LENGTH;
}

const FULL_NAME_RE = new RegExp("^[\\p{L}\\p{M} '.-]{1,100}$", "u");

export function isValidFullName(name: string): boolean {
  return FULL_NAME_RE.test(name.trim());
}

// ASC-142 -- a firm/company name needs a wider character set than a
// person's name (digits, "&", ","), e.g. "Cohen & Partners, LLP". Uses the
// RegExp constructor (not a /u-flagged literal), same as FULL_NAME_RE above
// -- this app's ES5 target rejects the u flag on regex literals.
const FIRM_NAME_RE = new RegExp("^[\\p{L}\\p{M}\\p{N} '&,.-]{1,200}$", "u");

export function isValidFirmName(name: string): boolean {
  return FIRM_NAME_RE.test(name.trim());
}
