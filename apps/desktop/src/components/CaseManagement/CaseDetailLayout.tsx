import { Outlet, useLocation } from "react-router-dom";
import { useCallback, useRef, useState } from "react";
import CaseDetailSidebar, { CaseDetailTab } from "./CaseDetailSidebar";

export interface CaseDetailOutletContext {
  activeRightTab: CaseDetailTab;
  setActiveRightTab: (tab: CaseDetailTab) => void;
  registerEditAnnotationsHandler: (handler: (() => void) | null) => void;
}

// Callers that navigate here directly to a specific tab (e.g. the home
// Overview panel's "jump to case" links) pass this via navigate()'s `state`.
export interface CaseDetailNavigationState {
  initialTab?: CaseDetailTab;
}

export default function CaseDetailLayout() {
  const location = useLocation();
  const initialTab = (location.state as CaseDetailNavigationState | null)?.initialTab;
  const [activeRightTab, setActiveRightTab] = useState<CaseDetailTab>(initialTab ?? "overview");
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
