import { Mail, RefreshCw, Check } from "lucide-react";
import FeatureBlock from "@/components/marketing/FeatureBlock";
import FeatureRowList from "@/components/marketing/FeatureRowList";
import { useLanguage } from "../../../context/LanguageContext";

export default function KeyFeatureEmailCorrespondencesSync() {
  const { t } = useLanguage();

  return (
    <div className="space-y-4">
      <FeatureBlock
        icon={Mail}
        title={t("kf_email_title")}
        description={t("kf_email_desc")}
        bullets={[t("kf_email_bullet_1"), t("kf_email_bullet_2"), t("kf_email_bullet_3")]}
        mockup={{ type: "illustrated", label: t("kf_email_mockup_label") }}
      />

      <FeatureRowList
        items={[
          { icon: RefreshCw, title: t("kf_email_row1_title"), description: t("kf_email_row1_desc") },
          { icon: Check, title: t("kf_email_row2_title"), description: t("kf_email_row2_desc") },
        ]}
      />
    </div>
  );
}
