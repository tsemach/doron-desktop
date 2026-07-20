import { Routes, Route } from "react-router-dom";
import CaseManagement from "@/components/CaseManagement/CaseManagement";
import DocsManagement from "../DocsManagement/DocsManagement";
import Settings from "../Settings/Settings";
import AppHome from "./AppHome";

export default function AppMain() {
  return (
    <Routes>
      <Route path="/" element={<AppHome />} />
      <Route path="/case-management/*" element={<CaseManagement />} />
      <Route path="/docs-management/*" element={<DocsManagement />} />
      <Route path="/settings" element={<Settings />} />
    </Routes>
  );
}
