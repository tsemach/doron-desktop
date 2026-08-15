import { Outlet } from "react-router-dom";
import CaseManagementSidebar from "./CasesManagementSidebar";

export default function CaseManagementListLayout() {
  return (
    <>
      <CaseManagementSidebar />
      <Outlet />
    </>
  );
}
