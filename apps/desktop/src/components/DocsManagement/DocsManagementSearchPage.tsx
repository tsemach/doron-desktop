import { useState } from "react";

import DocsManagementSearch from "./DocsManagementSearch";
import DocsManagementSearchAdvanced from "./DocsManagementSearchAdvanced";
import {
  defaultDocumentSearchAdvancedFilters,
  type DocumentSearchAdvancedFilters,
} from "./DocsManagementSearch.types";

export default function DocsManagementSearchPage() {
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<DocumentSearchAdvancedFilters>(
    defaultDocumentSearchAdvancedFilters,
  );

  return (
    <DocsManagementSearch
      advancedFilters={advancedFilters}
      showAdvancedSearch={showAdvancedSearch}
      onToggleAdvancedSearch={() => setShowAdvancedSearch((open) => !open)}
      advancedSearch={
        showAdvancedSearch ? (
          <DocsManagementSearchAdvanced filters={advancedFilters} onChange={setAdvancedFilters} />
        ) : null
      }
    />
  );
}
