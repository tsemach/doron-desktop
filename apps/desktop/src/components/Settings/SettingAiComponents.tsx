import React from "react";

const HelpCircleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

interface ProviderSelectorProps {
  value: string;
  onChange: (val: string) => void;
  onToggleHelp?: () => void;
  activeHelp?: string | null;
  providers?: { id: string; name: string }[];
  label?: string;
  disabled?: boolean;
}

export function ProviderSelector({
  value,
  onChange,
  onToggleHelp,
  activeHelp,
  providers = [
    { id: "gemini", name: "Gemini" },
    { id: "openai", name: "OpenAI" },
    { id: "anthropic", name: "Anthropic" },
    { id: "other", name: "Other" },
  ],
  label = "AI Provider",
  disabled = false,
}: ProviderSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-foreground flex items-center gap-1.5" htmlFor="provider-select">
        {label}
        {onToggleHelp && (
          <button
            type="button"
            onClick={onToggleHelp}
            className={`text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-0.5 rounded hover:bg-muted ${
              activeHelp === "ai" ? "text-foreground bg-muted" : ""
            }`}
            title="AI Config Help"
          >
            <HelpCircleIcon className="size-3.5" />
          </button>
        )}
      </label>
      <div className="relative">
        <select
          id="provider-select"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-full pl-4 pr-10 rtl:pr-4 rtl:pl-10 py-2.5 rounded-xl border border-input bg-background/50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer appearance-none text-foreground disabled:opacity-50"
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="absolute inset-y-0 right-3 rtl:left-3 rtl:right-auto flex items-center pointer-events-none text-muted-foreground">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </div>
    </div>
  );
}

interface ModelSelectorProps {
  value: string;
  onChange: (val: string) => void;
  onToggleHelp?: () => void;
  activeHelp?: string | null;
  models: string[];
  label?: string;
  disabled?: boolean;
}

export function ModelSelector({
  value,
  onChange,
  onToggleHelp,
  activeHelp,
  models,
  label = "Model",
  disabled = false,
}: ModelSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-foreground flex items-center gap-1.5" htmlFor="model-select">
        {label}
        {onToggleHelp && (
          <button
            type="button"
            onClick={onToggleHelp}
            className={`text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-0.5 rounded hover:bg-muted ${
              activeHelp === "ai" ? "text-foreground bg-muted" : ""
            }`}
            title="AI Config Help"
          >
            <HelpCircleIcon className="size-3.5" />
          </button>
        )}
      </label>
      <div className="relative">
        <select
          id="model-select"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-full pl-4 pr-10 rtl:pr-4 rtl:pl-10 py-2.5 rounded-xl border border-input bg-background/50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer appearance-none text-foreground disabled:opacity-50"
        >
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <div className="absolute inset-y-0 right-3 rtl:left-3 rtl:right-auto flex items-center pointer-events-none text-muted-foreground">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </div>
    </div>
  );
}
