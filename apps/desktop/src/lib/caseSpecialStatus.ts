import { invoke } from "@tauri-apps/api/core";
import type { CaseStatus, Tag } from "@/components/CaseManagement/CaseManagementTypes";

interface SpecialStatusTagConfig {
  status: CaseStatus;
  tagType: "user" | "system";
}

// Central registry of tags that drive a case status transition. Adding a new
// special-status tag only requires one entry here — the confirm modal,
// status update, and reopen/remove-tag reversal below are all generic.
export const SPECIAL_STATUS_TAGS: Record<string, SpecialStatusTagConfig> = {
  closed: { status: "closed", tagType: "system" },
  waiting: { status: "waiting", tagType: "user" },
};

export function findActiveSpecialStatusTag(tags: Tag[]): Tag | undefined {
  return tags.find((tg) => tg.name in SPECIAL_STATUS_TAGS);
}

interface SpecialStatusResult {
  status: CaseStatus;
  tags: Tag[];
  /** Only set when this call actually touched the case's notes. */
  notes?: string;
}

/**
 * Transitions a case into a special status: clears any other special-status
 * tag already present (a case can only be in one such status at a time),
 * updates the case's status, adds the new tag, and saves the note as-is
 * (including clearing it if empty — callers are expected to prefill the note
 * field with any existing notes, so an empty submission is an explicit clear,
 * not "leave untouched").
 */
export async function applyCaseSpecialStatus(
  caseId: string,
  tagName: string,
  currentTags: Tag[],
  notes: string
): Promise<SpecialStatusResult> {
  const config = SPECIAL_STATUS_TAGS[tagName];
  if (!config) {
    throw new Error(`"${tagName}" is not a registered special-status tag`);
  }

  await invoke("update_case_status", { id: Number(caseId), status: config.status });

  const otherSpecialTags = currentTags.filter(
    (tg) => tg.name in SPECIAL_STATUS_TAGS && tg.name !== tagName
  );
  for (const tg of otherSpecialTags) {
    await invoke("remove_tag", { scopeType: "case", scopeValue: caseId, name: tg.name });
  }

  const trimmedNotes = notes.trim();
  await invoke("set_case_annotations", { caseId: Number(caseId), notes: trimmedNotes || null });

  const tag = await invoke<Tag>("add_tag", {
    scopeType: "case",
    scopeValue: caseId,
    name: tagName,
    value: null,
    tagType: config.tagType,
  });

  const removedNames = new Set(otherSpecialTags.map((tg) => tg.name));
  const tags = [...currentTags.filter((tg) => !removedNames.has(tg.name) && tg.name !== tagName), tag];

  return { status: config.status, tags, notes: trimmedNotes || undefined };
}

/**
 * Reverts a case out of whichever special status it's currently in, back to
 * "open" — removes the matching tag and resets the status field.
 */
export async function clearCaseSpecialStatus(
  caseId: string,
  currentTags: Tag[]
): Promise<SpecialStatusResult> {
  const activeTag = findActiveSpecialStatusTag(currentTags);

  await invoke("update_case_status", { id: Number(caseId), status: "open" });

  if (activeTag) {
    await invoke("remove_tag", { scopeType: "case", scopeValue: caseId, name: activeTag.name });
  }

  return {
    status: "open",
    tags: activeTag ? currentTags.filter((tg) => tg.name !== activeTag.name) : currentTags,
  };
}
