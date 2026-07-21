import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "./button";

export type BackButtonProps = {
  className?: string;
  navigateTo?: number | string;
  iconOnly?: boolean;
};

export default function BackButton({ className, navigateTo, iconOnly }: BackButtonProps) {
  const navigate = useNavigate();

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
        aria-label="Back"
        className={`border-0 ${className || ""}`}
      >
        <ArrowLeft className="size-4" />
      </Button>
    );
  }

  return (
    <div className={`flex items-center gap-1 justify-start ${className || ""}`}>
      <Button variant="ghost" onClick={handleClick} className="flex items-center gap-1">
        ← Back
      </Button>
    </div>
  );
}
