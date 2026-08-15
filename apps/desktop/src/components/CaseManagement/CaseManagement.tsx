import { Route, Routes } from "react-router-dom";
import CaseManagementListLayout from "./CaseManagementListLayout";
import CaseDetailLayout from "./CaseDetailLayout";
import CaseManagementOpenCases from "./CaseManagementOpenCases/CaseManagementOpenCases";
import CasesManagementTemplate from "./CasesManagementTemplate/CasesManagementTemplate";
import CasesManagementTaskTemplate from "./CasesManagementTaskTemplate/CasesManagementTaskTemplate";
import CaseManagementCaseCreate from "./CaseManagementCaseCreate";
import CaseManagementOpenCasesDetails from "./CaseManagementOpenCases/CaseManagementOpenCasesDetails";
import CaseManagementEmailAlertReview from "./CaseManagementOpenCases/CaseManagementEmailAlertReview";

export default function CaseManagement() {

  return (
    <div className="flex h-screen relative w-full overflow-hidden">
      <Routes>
        <Route element={<CaseManagementListLayout />}>
          <Route path="/" element={<CaseManagementOpenCases />} />
          <Route path="templates" element={<CasesManagementTemplate />} />
          <Route path="task-templates" element={<CasesManagementTaskTemplate />} />
          <Route path="new-case" element={<CaseManagementCaseCreate />} />
        </Route>
        <Route element={<CaseDetailLayout />}>
          <Route path="cases/:caseId" element={<CaseManagementOpenCasesDetails />} />
        </Route>
      </Routes>
      <CaseManagementEmailAlertReview />
    </div>
  );
}
