"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { inputClass, LOGIN_PASSWORD_LENGTH } from "../../lib/auth-form";

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  name?: string;
}

export function PasswordInput({ value, onChange, placeholder, autoComplete, name }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  // Only for password-creation fields (register/accept-invite), never
  // login -- opts out of LastPass/1Password/Bitwarden's icon overlay in
  // the field. Doesn't touch Chrome's own built-in "suggest a strong
  // password" bubble, which is intentionally tied to autocomplete=
  // "new-password" and can't be suppressed without giving up that (correct)
  // semantic.
  const isNewPassword = autoComplete === "new-password";

  return (
    <div className="relative">
      <input
        type={visible ? "text" : "password"}
        required
        maxLength={LOGIN_PASSWORD_LENGTH}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} pr-9`}
        placeholder={placeholder}
        autoComplete={autoComplete}
        name={name}
        data-lpignore={isNewPassword ? "true" : undefined}
        data-1p-ignore={isNewPassword ? "true" : undefined}
        data-bwignore={isNewPassword ? "true" : undefined}
        data-form-type={isNewPassword ? "other" : undefined}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
