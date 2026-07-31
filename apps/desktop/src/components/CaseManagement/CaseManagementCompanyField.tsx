import { useState } from "react";
import TagValueCombobox from "@/components/ui/TagValueCombobox";
import CaseManagementAddCompanyModal from "./CaseManagementAddCompanyModal";

interface CaseManagementCompanyFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Company combobox + "add new company" modal, shared by the case creation form
 * and the case annotations tag editor so both pick-existing/create-new flows
 * stay identical.
 */
export default function CaseManagementCompanyField({
  value,
  onChange,
  placeholder,
  disabled,
  className,
}: CaseManagementCompanyFieldProps) {
  const [pendingNewCompany, setPendingNewCompany] = useState<string | null>(null);

  return (
    <>
      <TagValueCombobox
        tagName="company"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        onValueCommitted={(v, isNew) => {
          if (isNew) setPendingNewCompany(v);
        }}
      />
      {pendingNewCompany && (
        <CaseManagementAddCompanyModal
          initialCompanyName={pendingNewCompany}
          onConfirm={(name) => {
            onChange(name);
            setPendingNewCompany(null);
          }}
          onCancel={() => setPendingNewCompany(null)}
        />
      )}
    </>
  );
}
