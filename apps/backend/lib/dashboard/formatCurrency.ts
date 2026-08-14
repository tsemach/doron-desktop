export function formatILS(amount: number): string {
  return `₪${amount.toLocaleString("en-US")}`;
}
