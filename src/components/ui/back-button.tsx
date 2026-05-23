import { useNavigate } from "react-router-dom";
import { Button } from "./button";

export type BackButtonProps = {
  className?: string;
  navigateTo?: number | string;
};

export default function BackButton({ className, navigateTo }: BackButtonProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (typeof navigateTo === "string") {
      navigate(navigateTo);
    } else {
      navigate(navigateTo ?? -1);
    }
  }
  
  return (    
    <div className={`flex items-center gap-1 justify-start ${className || ""}`}>
      <Button variant="ghost" onClick={handleClick} className="flex items-center gap-1">
        ← Back
      </Button>
    </div>
  );
}
