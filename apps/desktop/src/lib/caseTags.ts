import { Tag } from "@/components/CaseManagement/CaseManagementTypes";

// Tags that get dedicated treatment elsewhere in the case-detail UI (the
// header's case-type badge, the Overview follow-up banner) and so are
// excluded from generic tag chip lists to avoid showing the same fact twice.
const DEDICATED_TAG_NAMES = ["type", "followup"];

export function findTagValue(tags: Tag[], name: string): string | undefined {
  return tags.find((t) => t.name.toLowerCase() === name)?.value;
}

export function filterOverviewTags(tags: Tag[]): Tag[] {
  return tags.filter((t) => !DEDICATED_TAG_NAMES.includes(t.name.toLowerCase()));
}
