import { ListChecks, ClipboardCheck, Pencil, LayoutDashboard } from "lucide-react";
import FeatureBlock from "@/components/marketing/FeatureBlock";
import FeatureRowList from "@/components/marketing/FeatureRowList";
import { useLanguage } from "../../../context/LanguageContext";

export default function KeyFeatureTaskManagement() {
  const { t } = useLanguage();

  return (
    <div className="space-y-4">
      <FeatureBlock
        icon={ListChecks}
        title={t("kf_tasks_title")}
        description={t("kf_tasks_desc")}
        bullets={[t("kf_tasks_bullet_1"), t("kf_tasks_bullet_2"), t("kf_tasks_bullet_3")]}
        mockup={{ type: "illustrated", label: t("kf_tasks_mockup_label") }}
      />

      <FeatureRowList
        items={[
          { icon: ClipboardCheck, title: t("kf_tasks_row1_title"), description: t("kf_tasks_row1_desc") },
          { icon: Pencil, title: t("kf_tasks_row2_title"), description: t("kf_tasks_row2_desc") },
          { icon: LayoutDashboard, title: t("kf_tasks_row3_title"), description: t("kf_tasks_row3_desc") },
        ]}
      />
    </div>
  );
}
