// Mirrors the Rust `MeetingRow` struct's wire shape as-is (snake_case), same
// convention as `Task`/`CaseTemplate` -- used directly from invoke() results
// without a remapping step.
export interface Meeting {
  id: number;
  google_event_id: string;
  case_id: number | null;
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  end_time: string;
  status: "confirmed" | "tentative" | "cancelled";
  case_link_source: "none" | "phrase_match" | "manual";
  created_at: string;
  updated_at: string | null;
}

export type CalendarViewMode = "day" | "week" | "month";

// Mirrors get_google_calendar_status's Some(...) shape -- None (no
// connection) is represented as `null` at the call site, not by this type.
export interface GoogleCalendarStatus {
  google_email: string;
  connected_at: string;
}
