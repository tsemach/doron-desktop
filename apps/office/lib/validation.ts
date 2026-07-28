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
