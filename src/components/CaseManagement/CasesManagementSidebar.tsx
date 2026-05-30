import { useNavigate, useLocation } from "react-router-dom";
import BackButton from "../ui/back-button";
import { Button } from "../ui/button";

export default function CaseManagementSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;

  const isOpenCasesActive =
    pathname === "/case-management" ||
    (pathname.startsWith("/case-management") &&
      !pathname.startsWith("/case-management/templates") &&
      !pathname.startsWith("/case-management/new-case"));

  const isNewCaseActive = pathname.startsWith("/case-management/new-case");
  const isTemplatesActive = pathname.startsWith("/case-management/templates");

  return (
    <aside className="w-35 shrink-0 flex flex-col py-4 px-3 border-r border-border">       
      <BackButton navigateTo={"/"} /> 

      <div className="border-t border-border -mx-3 mt-2" />

      {/* Centered Navigation Menu */}
      <div className="flex-1 flex flex-col justify-center">
        <div className="flex flex-col gap-1">
          <Button
            variant="ghost"
            className={`w-full justify-start font-normal ${
              isOpenCasesActive ? "bg-muted text-foreground font-semibold" : ""
            }`}
            onClick={() => navigate("/case-management")}
          >
            Open Cases
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground/40 cursor-not-allowed"
            disabled
          >
            Search
          </Button>
          <Button
            variant="ghost"
            className={`w-full justify-start font-normal ${
              isNewCaseActive ? "bg-muted text-foreground font-semibold" : ""
            }`}
            onClick={() => navigate("/case-management/new-case")}
          >
            New Case
          </Button>
        </div>

        <div className="border-t border-border -mx-3 my-4" />

        <div className="flex flex-col gap-1">
          <Button
            variant="ghost"
            className={`w-full justify-start font-normal ${
              isTemplatesActive ? "bg-muted text-foreground font-semibold" : ""
            }`}
            onClick={() => navigate("/case-management/templates")}
          >
            Template
          </Button>        
        </div>
      </div>

      {/* Footer Profile Section */}
      <div>
        <div className="border-t border-border -mx-3" />
        <div className="flex items-center justify-center py-2">
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
          </div>
        </div>
        <div className="border-t border-border -mx-3 mb-2" />
        <div className="flex items-center justify-center pb-2 pt-2">
          <span className="text-xs text-muted-foreground">Doron Mizachi</span>
        </div>
      </div>
    </aside>
  );
}