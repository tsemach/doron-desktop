import { Cpu, FileText, FileSpreadsheet } from "lucide-react";
import FeatureBlock from "@/components/marketing/FeatureBlock";
import FeatureRowList from "@/components/marketing/FeatureRowList";
import { useLanguage } from "../../../context/LanguageContext";

export default function KeyFeatureDocumentIndexing() {
  const { t } = useLanguage();

  return (
    <div className="space-y-4">
      <FeatureBlock
        icon={Cpu}
        title={t("kf_indexing_title")}
        description={t("kf_indexing_desc")}
        bullets={[t("kf_indexing_bullet_1"), t("kf_indexing_bullet_2"), t("kf_indexing_bullet_3")]}
        mockup={{ type: "illustrated", label: t("kf_indexing_mockup_label") }}
      />

      <FeatureRowList
        items={[
          { icon: FileText, title: t("kf_indexing_row1_title"), description: t("kf_indexing_row1_desc") },
          { icon: FileSpreadsheet, title: t("kf_indexing_row2_title"), description: t("kf_indexing_row2_desc") },
        ]}
      />
    </div>
  );
}
