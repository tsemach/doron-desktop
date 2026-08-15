import { Tag, FileEdit, FolderHeart } from "lucide-react";
import FeatureBlock from "@/components/marketing/FeatureBlock";
import FeatureRowList from "@/components/marketing/FeatureRowList";
import { useLanguage } from "../../../context/LanguageContext";

export default function KeyFeatureDocumentTagsAndNotes() {
  const { t } = useLanguage();

  return (
    <div className="space-y-4">
      <FeatureBlock
        icon={Tag}
        title={t("kf_tags_title")}
        description={t("kf_tags_desc")}
        bullets={[t("kf_tags_bullet_1"), t("kf_tags_bullet_2"), t("kf_tags_bullet_3")]}
        mockup={{
          type: "screenshot",
          src: "/screenshot_templates_hover.png",
          alt: t("kf_tags_alt"),
        }}
      />

      <FeatureRowList
        items={[
          { icon: FileEdit, title: t("kf_tags_row1_title"), description: t("kf_tags_row1_desc") },
          { icon: FolderHeart, title: t("kf_tags_row2_title"), description: t("kf_tags_row2_desc") },
        ]}
      />
    </div>
  );
}
