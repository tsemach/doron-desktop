import { Users, UserPlus, ShieldCheck, Building2 } from "lucide-react";
import FeatureBlock from "@/components/marketing/FeatureBlock";
import FeatureRowList from "@/components/marketing/FeatureRowList";

export default function KeyFeatureTeamsAndRoles() {
  return (
    <div className="space-y-4">
      <FeatureBlock
        icon={Users}
        title="Teams & Roles"
        description="Ascurix isn't just for solo practitioners. Bring your whole firm onto one account: invite teammates, organize them into teams, and control who can manage what with role-based permissions — while every case file and document stays local to each person's own machine."
        bullets={[
          "Invite teammates by email with a role and team assigned upfront",
          "Role-based permissions (admin, manager, user) gate who can invite and manage",
          "Organize your firm into teams, each with its own manager and roster",
        ]}
        mockup={{ type: "illustrated", label: "Settings — Users and Roles" }}
        side="right"
      />

      <FeatureRowList
        items={[
          {
            icon: UserPlus,
            title: "Invite Teammates",
            description: "Invite by email with a role and, optionally, a team assigned at invite time — they set their own password.",
          },
          {
            icon: ShieldCheck,
            title: "Role-Based Permissions",
            description: "Admins manage the whole firm; managers manage their own teams; users get read-only firm visibility.",
          },
          {
            icon: Building2,
            title: "Firm-Level Accounts",
            description: "A shared roster and team structure for your firm — case content itself never leaves each person's machine.",
          },
        ]}
      />
    </div>
  );
}
