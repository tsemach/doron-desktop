import React from "react";

type SettingMenuTabItemProps = {
  isActive: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: React.ReactNode;
  rightElement?: React.ReactNode;
  disabled?: boolean;
};

export default function SettingMenuTabItem({
  isActive,
  onClick,
  icon: Icon,
  label,
  rightElement,
  disabled,
}: SettingMenuTabItemProps) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={disabled ? "Requires Pro" : undefined}
      className={`w-full text-left rtl:text-right px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-between relative ${
        disabled
          ? "text-muted-foreground/50 cursor-not-allowed"
          : isActive
          ? "bg-accent text-foreground shadow-sm font-bold cursor-pointer"
          : "text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
      }`}
    >
      {isActive && !disabled && (
        <div className="absolute left-0 rtl:left-auto rtl:right-0 top-2.5 bottom-2.5 w-1 bg-foreground rounded-full animate-fade-in" />
      )}
      <div className="flex items-center gap-2.5">
        <Icon className={`size-4 ${disabled ? "text-muted-foreground/50" : "text-foreground"}`} />
        {label}
      </div>
      {rightElement}
    </button>
  );
}
