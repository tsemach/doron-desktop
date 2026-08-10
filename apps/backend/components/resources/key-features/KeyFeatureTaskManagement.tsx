import { ListChecks, ClipboardCheck, Pencil, LayoutDashboard } from "lucide-react";
import FeatureBlock from "@/components/marketing/FeatureBlock";
import FeatureRowList from "@/components/marketing/FeatureRowList";

export default function KeyFeatureTaskManagement() {
  return (
    <div className="space-y-4">
      <FeatureBlock
        icon={ListChecks}
        title="Task Management"
        description="Stop rebuilding the same checklist for every new matter. Ascurix Desktop generates a case's task list from a reusable template the moment it's created, tracks each task's status, and rolls every case's tasks into one dashboard so nothing falls through the cracks."
        bullets={[
          "Templated checklists auto-generate tasks with due dates at case creation",
          "Review and tweak every generated task before the case is created",
          "A cross-case dashboard surfaces what's overdue or due today",
        ]}
        mockup={{ type: "illustrated", label: "Task Dashboard" }}
      />

      <FeatureRowList
        items={[
          {
            icon: ClipboardCheck,
            title: "Templated Task Checklists",
            description: "Define a task template once — every new case of that type auto-generates its task list with due dates.",
          },
          {
            icon: Pencil,
            title: "Editable Before Commit",
            description: "Retitle, redescribe, re-estimate, or drop any generated task before the case is actually created.",
          },
          {
            icon: LayoutDashboard,
            title: "Cross-Case Dashboard",
            description: "Search and filter every task across your caseload, with urgent (overdue/due-today) items surfaced first.",
          },
        ]}
      />
    </div>
  );
}
