export type CaseStatus = "open" | "waiting" | "closed";

export interface CaseSummary {
  id: string;
  subject: string; // bold line, e.g. "תביעה בגין רשלנות"
  client: string; // muted line below subject
  status: CaseStatus;
  updatedAt: string; // ISO date; "Recent cases" group sorts by this, most recent first
  dueDate?: string; // ISO date; "Follow up" group = dueDate in the past
  hasPendingEmail?: boolean; // "Email arrived" group = true
}

export type StatTileIcon = "Mail" | "CalendarClock" | "Briefcase" | "ListChecks";

export interface StatTileData {
  id: string;
  icon: StatTileIcon; // lucide-react icon name, must be a key in StatTile.tsx's ICONS map
  primary: { count: number; label: string };
  secondary?: { count: number; label: string }; // e.g. "5 open cases" + "1 follow-up"
}

export interface NotificationItem {
  id: string;
  message: string;
  timestamp: string; // ISO date
  type: "email" | "document" | "case" | "system";
}

export type TaskUrgency = "overdue" | "due-today" | "upcoming";

export interface ImportantTask {
  id: string;
  title: string;
  caseSubject: string;
  dueAt: string; // ISO datetime
  urgency: TaskUrgency; // overdue -> rose rail, due-today -> amber, upcoming -> slate
}

export type EmailMatchStatus = "matched" | "needs-review";

export interface EmailArrival {
  id: string;
  sender: string;
  subject: string;
  matchedCaseSubject?: string; // present only when matchStatus is "matched"
  receivedAt: string; // ISO datetime
  matchStatus: EmailMatchStatus; // matched -> blue rail, needs-review -> amber rail
}

export interface BillingCaseProgress {
  id: string;
  caseSubject: string;
  paidAmount: number; // ILS
  totalAmount: number; // ILS
  isOverdue: boolean; // true -> rose progress fill, false -> emerald
}

export interface BillingSummary {
  outstandingAmount: number; // ILS
  collectedThisMonth: number; // ILS
  cases: BillingCaseProgress[];
  pendingInvoiceLabel: string; // e.g. "Invoice #2026-0142 · pending payment"
}
