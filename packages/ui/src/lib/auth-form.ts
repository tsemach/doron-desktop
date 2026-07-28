// Shared Tailwind class strings for the register/login form fields — kept as
// plain constants rather than a new shared Input component, since no such
// component exists anywhere in this codebase yet (desktop only has `button.tsx`
// under packages/ui). Introducing one here would be a new abstraction with a
// single caller, not "matching an existing pattern".
export const labelClass = "mb-1 block text-xs font-medium text-muted-foreground";
export const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
export const errorClass =
  "rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive";

// Single source of truth for the password length cap, shared by PasswordInput's
// maxLength (client-side truncation) and both apps' isValidPasswordLength
// (register-time validation) -- keeping these in sync prevents a repeat of the
// bug where the input silently truncated below what validation/storage allowed.
export const LOGIN_PASSWORD_LENGTH = 48;
