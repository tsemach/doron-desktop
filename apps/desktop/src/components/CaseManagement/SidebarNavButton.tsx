import { Button } from "../ui/button";

interface SidebarNavButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

export default function SidebarNavButton({ label, active, onClick }: SidebarNavButtonProps) {
  return (
    <Button
      variant="ghost"
      className={`w-full h-16 flex flex-col items-center justify-center text-center whitespace-normal break-words px-2 font-normal text-xs ${
        active ? "bg-muted text-foreground font-semibold" : ""
      }`}
      onClick={onClick}
    >
      {label.split(" ").map((word, i) => (
        <span key={i} className="block leading-none">{word}</span>
      ))}
    </Button>
  );
}
