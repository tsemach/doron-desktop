import type { Tag } from "@/components/CaseManagement/CaseManagementTypes";

interface TagChipProps {
  tag: Tag;
  onRemove?: (tag: Tag) => void;
}

export default function TagChip({ tag, onRemove }: TagChipProps) {
  const isSystem = tag.type === "system";
  const label = tag.value ? `${tag.name}: ${tag.value}` : tag.name;

  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1 py-px rounded-full text-[9px] font-normal lowercase leading-tight select-none ${
        isSystem
          ? "bg-muted/50 text-muted-foreground/75"
          : "bg-primary/5 text-primary/75"
      }`}
      title={isSystem ? "System tag (managed automatically)" : undefined}
    >
      {isSystem && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="7"
          height="7"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className="shrink-0"
        >
          <rect x="5" y="11" width="14" height="9" rx="1.5" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      )}
      #{label}
      {!isSystem && onRemove && (
        <button
          type="button"
          onClick={() => onRemove(tag)}
          className="hover:bg-primary/20 text-primary/75 hover:text-primary rounded-full p-0.5 leading-none transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="8"
            height="8"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </span>
  );
}
