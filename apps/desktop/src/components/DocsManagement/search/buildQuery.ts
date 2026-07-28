export function buildQuery(text: string, docType: string, dateFrom: string, dateTo: string): string {
  const parts: string[] = [];
  if (text.trim()) parts.push(text.trim());
  if (docType) parts.push(`document type: ${docType}`);
  if (dateFrom && dateTo) parts.push(`from ${dateFrom} to ${dateTo}`);
  else if (dateFrom) parts.push(`from ${dateFrom}`);
  else if (dateTo) parts.push(`until ${dateTo}`);
  return parts.join(", ");
}
