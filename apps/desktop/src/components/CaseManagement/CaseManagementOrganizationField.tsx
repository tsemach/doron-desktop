import { useState } from "react";
import TagValueCombobox from "@/components/ui/TagValueCombobox";
import CaseManagementAddOrganizationModal from "./CaseManagementAddOrganizationModal";

interface CaseManagementOrganizationFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Organization combobox + "add new organization" modal, shared by the case creation form
 * and the case annotations tag editor so both pick-existing/create-new flows
 * stay identical.
 */
export default function CaseManagementOrganizationField({
  value,
  onChange,
  placeholder,
  disabled,
  className,
}: CaseManagementOrganizationFieldProps) {
  const [pendingNewOrganization, setPendingNewOrganization] = useState<string | null>(null);

  return (
    <>
      <TagValueCombobox
        tagName="organization"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        onValueCommitted={(v, isNew) => {
          if (isNew) setPendingNewOrganization(v);
        }}
      />
      {pendingNewOrganization && (
        <CaseManagementAddOrganizationModal
          initialOrganizationName={pendingNewOrganization}
          onConfirm={(name) => {
            onChange(name);
            setPendingNewOrganization(null);
          }}
          onCancel={() => setPendingNewOrganization(null)}
        />
      )}
    </>
  );
}
