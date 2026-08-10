export type PillTab = {
  id: string;
  label: string;
};

type PillTabsProps = {
  tabs: PillTab[];
  activeId: string;
  onSelect: (id: string) => void;
};

// Horizontal rounded-pill section nav, replacing the old vertical sidebar
// pattern on the key-features page (kadin.co.il's category-tab style).
export default function PillTabs({ tabs, activeId, onSelect }: PillTabsProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors cursor-pointer ${
              isActive
                ? "bg-brand-accent text-brand-accent-foreground"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
