import { Routes, Route } from "react-router-dom";
import TaskManagementHeader from "./TaskManagementHeader";
import TaskManagementDashboard from "./TaskManagementDashboard";

export default function TaskManagement() {
  return (
    <div className="flex flex-col h-screen w-full bg-background overflow-hidden">
      <TaskManagementHeader />
      <div className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<TaskManagementDashboard />} />
        </Routes>
      </div>
    </div>
  );
}
