import { Routes, Route } from "react-router-dom";
import CaseManagement from "@/components/CaseManagement/CaseManagement";
import DocsManagement from "../DocsManagement/DocsManagement";
import TaskManagement from "../TaskManagement/TaskManagement";
import Settings from "../Settings/Settings";
import AppHome from "./AppHome";

export default function AppMain() {
  return (
    <Routes>
      <Route path="/" element={<AppHome />} />
      <Route path="/case-management/*" element={<CaseManagement />} />
      <Route path="/docs-management/*" element={<DocsManagement />} />
      <Route path="/task-management/*" element={<TaskManagement />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<AppHome />} />
    </Routes>
  );
}
