import { User, Settings, Sparkles, LogOut } from "lucide-react";
import KebabMenu from "../ui/KebabMenu";
import { useSubscriptionTier } from "@/lib/featureGating";
import { useLanguage } from "@/context/LanguageContext";

export interface AppUserMenuProps {
  handleSettings: () => void;
  handleUpgrade: () => void;
  handleLogout: () => void;
}

export function AppUserMenu({ handleSettings, handleUpgrade, handleLogout }: AppUserMenuProps) {
  const { t } = useLanguage();
  
  const tier = useSubscriptionTier();
  
  return (
    <KebabMenu
      title="Account"
      triggerIcon={<User className="size-6" />}
      triggerClassName="h-14 w-14 rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-accent"
      items={[
        {
          label: t("settings_footer"),
          icon: <Settings className="size-4" />,
          onClick: handleSettings,
        },
        {
          label: "Upgrade to Pro",
          icon: <Sparkles className="size-4" />,
          onClick: handleUpgrade,
          hidden: tier === "pro",
        },
        {
          label: t("log_out"),
          icon: <LogOut className="size-4" />,
          onClick: handleLogout,
          variant: "destructive",
        },
      ]}
    />
  );
}
