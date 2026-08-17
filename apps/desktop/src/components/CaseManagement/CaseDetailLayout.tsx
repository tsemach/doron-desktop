import { Outlet } from "react-router-dom";
import { useCallback, useRef, useState } from "react";
import CaseDetailSidebar, { CaseDetailTab } from "./CaseDetailSidebar";

export interface CaseDetailOutletContext {
  activeRightTab: CaseDetailTab;
  setActiveRightTab: (tab: CaseDetailTab) => void;
  registerEditAnnotationsHandler: (handler: (() => void) | null) => void;
}

export default function CaseDetailLayout() {
  const [activeRightTab, setActiveRightTab] = useState<CaseDetailTab>("overview");
  const editAnnotationsHandlerRef = useRef<(() => void) | null>(null);

  const registerEditAnnotationsHandler = useCallback((handler: (() => void) | null) => {
    editAnnotationsHandlerRef.current = handler;
  }, []);

  const context: CaseDetailOutletContext = {
    activeRightTab,
    setActiveRightTab,
    registerEditAnnotationsHandler,
  };

  return (
    <>
      <CaseDetailSidebar
        activeRightTab={activeRightTab}
        onTabChange={setActiveRightTab}
        onEditTagsNotes={() => editAnnotationsHandlerRef.current?.()}
      />
      <Outlet context={context} />
    </>
  );
}
