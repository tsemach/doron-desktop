import { Users, UserPlus, ShieldCheck, Building2 } from "lucide-react";
import FeatureBlock from "@/components/marketing/FeatureBlock";
import FeatureRowList from "@/components/marketing/FeatureRowList";
import { useLanguage } from "../../../context/LanguageContext";

export default function KeyFeatureTeamsAndRoles() {
  const { t } = useLanguage();

  return (
    <div className="space-y-4">
      <FeatureBlock
        icon={Users}
        title={t("kf_teams_title")}
        description={t("kf_teams_desc")}
        bullets={[t("kf_teams_bullet_1"), t("kf_teams_bullet_2"), t("kf_teams_bullet_3")]}
        mockup={{ type: "illustrated", label: t("kf_teams_mockup_label") }}
        side="right"
      />

      <FeatureRowList
        items={[
          { icon: UserPlus, title: t("kf_teams_row1_title"), description: t("kf_teams_row1_desc") },
          { icon: ShieldCheck, title: t("kf_teams_row2_title"), description: t("kf_teams_row2_desc") },
          { icon: Building2, title: t("kf_teams_row3_title"), description: t("kf_teams_row3_desc") },
        ]}
      />
    </div>
  );
}
