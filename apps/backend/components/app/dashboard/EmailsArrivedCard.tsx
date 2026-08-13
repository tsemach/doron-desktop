import { Mail } from "lucide-react";
import type { EmailArrival } from "../../../lib/dashboard/types";
import DashboardCard from "@/components/app/dashboard/DashboardCard";
import StatusRail from "@/components/app/dashboard/StatusRail";

type EmailsArrivedCardProps = {
  emails: EmailArrival[];
};

export default function EmailsArrivedCard({ emails }: EmailsArrivedCardProps) {
  const [spotlight, ...rest] = emails;

  return (
    <DashboardCard
      icon={<Mail className="h-4 w-4 text-muted-foreground shrink-0" />}
      title="Emails Arrived"
      count={emails.length}
      column={2}
    >
      {spotlight && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Next up</p>
          <p className="mt-1 truncate text-sm font-semibold text-foreground">{spotlight.subject}</p>
          <p className="truncate text-xs text-muted-foreground">{spotlight.sender}</p>
          <p className="mt-1 text-xs text-indigo-700">
            {spotlight.matchStatus === "matched" ? spotlight.matchedCaseSubject : "Needs review"}
          </p>
        </div>
      )}
      {rest.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {rest.map((email) => (
            <li key={email.id}>
              <StatusRail color={email.matchStatus === "matched" ? "blue" : "amber"}>
                <p className="truncate text-sm font-medium text-foreground">{email.subject}</p>
                <p className="truncate text-xs text-muted-foreground">{email.sender}</p>
                <p className="text-xs text-muted-foreground">
                  {email.matchStatus === "matched" ? email.matchedCaseSubject : "Needs review"}
                </p>
              </StatusRail>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}
