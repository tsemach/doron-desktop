import { TranslationKey } from "@/locales/translations";

export interface CaseTypeOption {
  value: string;
  labelKey: TranslationKey;
}

// Fixed legal specialization list from ASC-161. `value` is the stable
// identifier stored as the case's "type" tag value; labels are localized.
export const CASE_TYPE_OPTIONS: CaseTypeOption[] = [
  { value: "litigation", labelKey: "case_type_litigation" },
  { value: "commercial_corporate", labelKey: "case_type_commercial_corporate" },
  { value: "real_estate", labelKey: "case_type_real_estate" },
  { value: "labor_employment", labelKey: "case_type_labor_employment" },
  { value: "family_law", labelKey: "case_type_family_law" },
  { value: "criminal_white_collar", labelKey: "case_type_criminal_white_collar" },
  { value: "torts_medical_malpractice", labelKey: "case_type_torts_medical_malpractice" },
  { value: "ip_hi_tech", labelKey: "case_type_ip_hi_tech" },
  { value: "tax_law", labelKey: "case_type_tax_law" },
  { value: "administrative_public", labelKey: "case_type_administrative_public" },
];
