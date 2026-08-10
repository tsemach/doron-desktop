import FeatureRow, { type FeatureRowItem } from "./FeatureRow";

type FeatureRowListProps = {
  items: FeatureRowItem[];
};

// Hairline-divided secondary-feature rows -- lighter weight than
// FeatureBlock, for features that don't need a full icon+checklist+mockup
// treatment (kadin.co.il groups these under each main category).
export default function FeatureRowList({ items }: FeatureRowListProps) {
  return (
    <div className="divide-y divide-slate-100 border-t border-slate-100">
      {items.map((item) => (
        <FeatureRow key={item.title} {...item} />
      ))}
    </div>
  );
}
