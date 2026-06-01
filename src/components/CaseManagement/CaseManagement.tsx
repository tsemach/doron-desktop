import CaseManagementSidebar from "./CasesManagementSidebar";
import { Route, Routes } from "react-router-dom";
import CaseManagementOpenCases from "./CaseManagementOpenCases/CaseManagementOpenCases";
import CasesManagementTemplate from "./CasesManagementTemplate/CasesManagementTemplate";
import CaseManagementCaseCreate from "./CaseManagementCaseCreate";

export default function CaseManagement() {

  return (
    <div className="flex h-screen">
      <CaseManagementSidebar />
      <Routes>
        <Route path="/" element={<CaseManagementOpenCases />} />
        <Route path="templates" element={<CasesManagementTemplate />} />
        <Route path="new-case" element={<CaseManagementCaseCreate />} />
      </Routes>
    </div>
  );
}
