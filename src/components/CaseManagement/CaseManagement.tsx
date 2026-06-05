import CaseManagementSidebar from "./CasesManagementSidebar";
import { Route, Routes } from "react-router-dom";
import CaseManagementOpenCases from "./CaseManagementOpenCases/CaseManagementOpenCases";
import CasesManagementTemplate from "./CasesManagementTemplate/CasesManagementTemplate";
import CaseManagementCaseCreate from "./CaseManagementCaseCreate";
import CaseManagementOpenCasesDetails from "./CaseManagementOpenCases/CaseManagementOpenCasesDetails";
import EmailAlertReview from "./CaseManagementOpenCases/EmailAlertReview";

export default function CaseManagement() {

  return (
    <div className="flex h-screen relative w-full">
      <CaseManagementSidebar />
      <Routes>
        <Route path="/" element={<CaseManagementOpenCases />} />
        <Route path="templates" element={<CasesManagementTemplate />} />
        <Route path="new-case" element={<CaseManagementCaseCreate />} />
        <Route path="cases/:caseId" element={<CaseManagementOpenCasesDetails />} />
      </Routes>
      <EmailAlertReview />
    </div>
  );
}
