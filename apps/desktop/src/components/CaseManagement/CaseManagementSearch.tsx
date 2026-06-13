import { useLanguage } from "../../context/LanguageContext";

interface CaseManagementSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  containerClassName?: string;
  inputClassName?: string;
  searchIconSize?: number;
  searchIconStrokeWidth?: number;
  searchIconClassName?: string;
  clearIconSize?: number;
  clearButtonClassName?: string;
  clearButtonTitle?: string;
  autoFocus?: boolean;
}

export default function CaseManagementSearch({
  value,
  onChange,
  placeholder,
  containerClassName = "relative flex items-center",
  inputClassName = "w-full rounded-lg border border-input bg-background pl-8 pr-7 rtl:pr-8 rtl:pl-7 py-1 text-xs placeholder:text-muted-foreground/80 focus:outline-none focus:ring-1 focus:ring-ring transition-all",
  searchIconSize = 12,
  searchIconStrokeWidth = 2.5,
  searchIconClassName = "absolute left-2.5 rtl:left-auto rtl:right-2.5 text-muted-foreground",
  clearIconSize = 10,
  clearButtonClassName = "absolute right-2 rtl:right-auto rtl:left-2 text-muted-foreground hover:text-foreground p-0.5",
  clearButtonTitle = "Clear filter",
  autoFocus = false,
}: CaseManagementSearchProps) {
  const { t } = useLanguage();

  return (
    <div className={containerClassName}>
      <span className={searchIconClassName}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={searchIconSize}
          height={searchIconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={searchIconStrokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </span>
      <input
        type="text"
        placeholder={placeholder !== undefined ? placeholder : t("filter_files_placeholder")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClassName}
        autoFocus={autoFocus}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className={clearButtonClassName}
          title={clearButtonTitle}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width={clearIconSize}
            height={clearIconSize}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
