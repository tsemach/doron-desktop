import { Search, Zap, HelpCircle } from "lucide-react";
import FeatureBlock from "@/components/marketing/FeatureBlock";
import FeatureRowList from "@/components/marketing/FeatureRowList";
import { useLanguage } from "../../../context/LanguageContext";

export default function KeyFeatureFullTextSearch() {
  const { t } = useLanguage();

  return (
    <div className="space-y-4">
      <FeatureBlock
        icon={Search}
        title={t("kf_search_title")}
        description={t("kf_search_desc")}
        bullets={[t("kf_search_bullet_1"), t("kf_search_bullet_2"), t("kf_search_bullet_3")]}
        mockup={{
          type: "screenshot",
          src: "/screenshot_smart_search_results.png",
          alt: t("kf_search_alt"),
        }}
      />

      <FeatureRowList
        items={[
          { icon: Zap, title: t("kf_search_row1_title"), description: t("kf_search_row1_desc") },
          { icon: HelpCircle, title: t("kf_search_row2_title"), description: t("kf_search_row2_desc") },
        ]}
      />
    </div>
  );
}
