import { Layout, Compass, Lock, FileCheck } from "lucide-react";
import FeatureBlock from "@/components/marketing/FeatureBlock";
import FeatureRowList from "@/components/marketing/FeatureRowList";
import { useLanguage } from "../../../context/LanguageContext";

export default function KeyFeatureCentralWorkingSpace() {
  const { t } = useLanguage();

  return (
    <div className="space-y-4">
      <FeatureBlock
        icon={Layout}
        title={t("kf_workspace_title")}
        description={t("kf_workspace_desc")}
        bullets={[t("kf_workspace_bullet_1"), t("kf_workspace_bullet_2"), t("kf_workspace_bullet_3")]}
        mockup={{
          type: "screenshot",
          src: "/screenshot_smart_search_results.png",
          alt: t("kf_workspace_alt"),
        }}
      />

      <FeatureRowList
        items={[
          { icon: Layout, title: t("kf_workspace_row1_title"), description: t("kf_workspace_row1_desc") },
          { icon: Compass, title: t("kf_workspace_row2_title"), description: t("kf_workspace_row2_desc") },
          { icon: Lock, title: t("kf_workspace_row3_title"), description: t("kf_workspace_row3_desc") },
          { icon: FileCheck, title: t("kf_workspace_row4_title"), description: t("kf_workspace_row4_desc") },
        ]}
      />
    </div>
  );
}
