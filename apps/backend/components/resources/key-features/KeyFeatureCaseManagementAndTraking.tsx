import { Briefcase, FolderGit2, Tags } from "lucide-react";
import FeatureBlock from "@/components/marketing/FeatureBlock";
import FeatureRowList from "@/components/marketing/FeatureRowList";
import { useLanguage } from "../../../context/LanguageContext";

export default function KeyFeatureCaseManagementAndTraking() {
  const { t } = useLanguage();

  return (
    <div className="space-y-4">
      <FeatureBlock
        icon={Briefcase}
        title={t("kf_casemgmt_title")}
        description={t("kf_casemgmt_desc")}
        bullets={[t("kf_casemgmt_bullet_1"), t("kf_casemgmt_bullet_2"), t("kf_casemgmt_bullet_3")]}
        mockup={{
          type: "screenshot",
          src: "/screenshot_followup_badge.png",
          alt: t("kf_casemgmt_alt"),
        }}
      />

      <FeatureRowList
        items={[
          { icon: FolderGit2, title: t("kf_casemgmt_row1_title"), description: t("kf_casemgmt_row1_desc") },
          { icon: Tags, title: t("kf_casemgmt_row2_title"), description: t("kf_casemgmt_row2_desc") },
        ]}
      />
    </div>
  );
}
