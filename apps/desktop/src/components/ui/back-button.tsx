import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "./button";
import { useLanguage } from "../../context/LanguageContext";
import { cn } from "@/lib/utils";

export type BackButtonProps = {
  className?: string;
  navigateTo?: number | string;
  iconOnly?: boolean;
  title?: string;
  label?: string;
};

export default function BackButton({ className, navigateTo, iconOnly, title, label }: BackButtonProps) {
  const navigate = useNavigate();
  const { t, dir } = useLanguage();

  const handleClick = () => {
    if (typeof navigateTo === "string") {
      navigate(navigateTo);
    } else {
      navigate(navigateTo ?? -1);
    }
  }

  if (iconOnly) {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={handleClick}
        aria-label={title || "Back"}
        title={title}
        className={`border-0 ${className || ""}`}
      >
        <ArrowLeft className="size-4" />
      </Button>
    );
  }

  return (
    <div className={`flex items-center gap-1 justify-start ${className || ""}`}>
      <Button variant="ghost" onClick={handleClick} title={title} className={cn("flex items-center gap-1", className)}>
        {dir === "rtl" ? "→" : "←"} {label ?? t("back_to_main")}
      </Button>
    </div>
  );
}
