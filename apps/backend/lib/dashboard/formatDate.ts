const TIME_ZONE = "Asia/Jerusalem";
const LOCALE = "en-GB";

export function formatDashboardDate(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium", timeZone: TIME_ZONE }).format(new Date(iso));
}

export function formatDashboardTimestamp(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium", timeStyle: "short", timeZone: TIME_ZONE }).format(new Date(iso));
}
