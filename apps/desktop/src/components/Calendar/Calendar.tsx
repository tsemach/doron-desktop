import { Routes, Route } from "react-router-dom";
import CalendarHeader from "./CalendarHeader";
import CalendarView from "./CalendarView";

export default function Calendar() {
  return (
    <div className="flex flex-col h-screen w-full bg-background overflow-hidden">
      <CalendarHeader />
      <div className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<CalendarView />} />
        </Routes>
      </div>
    </div>
  );
}
