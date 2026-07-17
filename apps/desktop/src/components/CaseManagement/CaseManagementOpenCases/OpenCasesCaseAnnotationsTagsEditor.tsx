import { useState } from "react";
import { Button } from "@/components/ui/button";
import TagChip from "@/components/ui/TagChip";
import type { Tag } from "../CaseManagementTypes";

interface OpenCasesCaseAnnotationsTagsEditorProps {
  userTags: Tag[];
  systemTags: Tag[];
  suggestedTags: string[];
  onAddTag: (name: string, value?: string) => void;
  onRemoveTag: (tag: Tag) => void;
}

export default function OpenCasesCaseAnnotationsTagsEditor({
  userTags,
  systemTags,
  suggestedTags,
  onAddTag,
  onRemoveTag,
}: OpenCasesCaseAnnotationsTagsEditorProps) {
  const [newTagName, setNewTagName] = useState("");
  const [newTagValue, setNewTagValue] = useState("");

  const isTypingFollowup = newTagName.trim().toLowerCase() === "followup";

  // Ensure "followup"/"waiting" are always offered, excluding already-added tags.
  const filteredSuggestions = [...new Set(["followup", "waiting", ...suggestedTags])].filter(
    (name) => !userTags.some((tg) => tg.name === name)
  );

  function submitTag() {
    onAddTag(newTagName, newTagValue);
    setNewTagName("");
    setNewTagValue("");
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      submitTag();
    }
  };

  return (
    <div className="space-y-2 shrink-0">
      <label className="text-xs font-semibold text-foreground flex justify-between">
        <span>Tags</span>
        <span className="text-[10px] text-muted-foreground">Press Enter or comma to add</span>
      </label>

      {/* Render current tags (system tags shown read-only, user tags removable) */}
      <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 border border-input rounded-lg bg-background/50 focus-within:ring-1 focus-within:ring-ring focus-within:border-ring transition-all">
        {systemTags.map((tag) => (
          <TagChip key={tag.name} tag={tag} />
        ))}
        {userTags.map((tag) => (
          <TagChip key={tag.name} tag={tag} onRemove={onRemoveTag} />
        ))}
        <input
          type="text"
          placeholder={userTags.length === 0 && systemTags.length === 0 ? "Add tags (e.g. urgent, signed)..." : ""}
          value={newTagName}
          onChange={(e) => setNewTagName(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent text-xs text-foreground focus:outline-none border-none p-0.5 min-w-[120px]"
        />
      </div>

      {/* Optional value for the tag currently being typed */}
      {newTagName.trim() && (
        <div className="flex items-center gap-2 animate-in slide-in-from-top-1 duration-150">
          <input
            type={isTypingFollowup ? "date" : "text"}
            placeholder={isTypingFollowup ? undefined : "Optional value..."}
            value={newTagValue}
            onChange={(e) => setNewTagValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 rounded-lg border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
          />
          <Button
            type="button"
            size="sm"
            className="h-7 text-xs"
            onClick={submitTag}
          >
            Add
          </Button>
        </div>
      )}

      {/* Suggested Tags */}
      {filteredSuggestions.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
            Suggested Tags:
          </span>
          <div className="flex flex-wrap gap-1">
            {filteredSuggestions.slice(0, 10).map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => onAddTag(name)}
                className="px-2 py-0.5 rounded-full border border-border bg-background hover:bg-muted text-[10px] text-muted-foreground hover:text-foreground transition-all duration-150"
              >
                +{name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
