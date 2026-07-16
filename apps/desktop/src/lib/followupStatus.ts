export interface FollowupStatus {
  type: "overdue" | "due-today" | "pending";
  label: string;
}

export function getFollowupStatus(dateStr?: string): FollowupStatus | null {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);

  if (target.getTime() < today.getTime()) {
    return { type: "overdue", label: `Overdue: ${dateStr}` };
  } else if (target.getTime() === today.getTime()) {
    return { type: "due-today", label: `Due Today: ${dateStr}` };
  } else {
    return { type: "pending", label: `Follow-up: ${dateStr}` };
  }
}
