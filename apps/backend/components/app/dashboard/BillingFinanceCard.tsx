import { Wallet } from "lucide-react";
import type { BillingSummary } from "../../../lib/dashboard/types";
import { formatILS } from "../../../lib/dashboard/formatCurrency";
import DashboardCard from "@/components/app/dashboard/DashboardCard";

type BillingFinanceCardProps = {
  billing: BillingSummary;
};

export default function BillingFinanceCard({ billing }: BillingFinanceCardProps) {
  return (
    <DashboardCard icon={Wallet} title="Billing & Finance">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Outstanding</p>
          <p className="mt-1 text-xl font-bold text-foreground">{formatILS(billing.outstandingAmount)}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">Collected this month</p>
          <p className="mt-1 text-xl font-bold text-emerald-600">{formatILS(billing.collectedThisMonth)}</p>
        </div>
      </div>
      <ul className="mt-4 flex flex-col gap-3">
        {billing.cases.map((c) => {
          const percentPaid = Math.min(100, (c.paidAmount / c.totalAmount) * 100);
          return (
            <li key={c.id}>
              <p className="truncate text-sm font-medium text-foreground">{c.caseSubject}</p>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${c.isOverdue ? "bg-rose-500" : "bg-emerald-500"}`}
                  style={{ width: `${percentPaid}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatILS(c.paidAmount)} of {formatILS(c.totalAmount)}
              </p>
            </li>
          );
        })}
      </ul>
      <div className="mt-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          {billing.pendingInvoiceLabel}
        </span>
      </div>
    </DashboardCard>
  );
}
