// Shared client + server validation for auth forms (register/login), so the
// rules can't drift between what the UI checks and what the API enforces.

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// 16 is the actual signup password policy max (matches the "between 6 and
// 16 characters" copy in register/page.tsx, accept-invite/page.tsx, and the
// signup route's own error message) -- not to be confused with
// @workspace/ui's LOGIN_PASSWORD_LENGTH (48), which is only the login
// input's HTML maxLength, a generous UI truncation limit for typing/pasting
// an existing password, not a policy bound for new ones.
export function isValidPasswordLength(password: string): boolean {
  return password.length >= 6 && password.length <= 16;
}

// Allows letters from any script (this app is bilingual EN/HE, so Latin-only
// would wrongly reject real names) plus spaces, hyphens, apostrophes, and
// periods (for initials like "J. Cohen"). Rejects digits and anything
// markup/injection-shaped (<, >, {, }, backticks, semicolons, etc.).
// A regex literal with the `u` flag can't be used directly here -- this
// project's tsconfig targets es5, and TS restricts unicode-flag literals to
// es6+ targets at the type-checking level (Node itself supports it fine at
// runtime). Constructing it dynamically sidesteps that restriction.
const FULL_NAME_RE = new RegExp("^[\\p{L}\\p{M} '.-]{1,100}$", "u");

export function isValidFullName(name: string): boolean {
  return FULL_NAME_RE.test(name.trim());
}
