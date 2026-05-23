import BackButton from "../ui/back-button";
import { Button } from "../ui/button";
import { useNavigate } from "react-router-dom";

export default function CaseManagement() {
  const navigate = useNavigate();

  return (
    <aside className="w-35 shrink-0 flex flex-col py-4 px-3 border-r border-border">
        {/* <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 justify-start"
        >
          ← Back
        </Button> */}
        <BackButton navigateTo={-1} /> 

        <div className="border-t border-border -mx-3 mt-2" />

        <div className="flex-1 flex flex-col justify-center gap-1 pb-16">
          <Button variant="ghost" className="w-full justify-start">
            Open Cases
          </Button>
          <Button variant="ghost" className="w-full justify-start">
            Search
          </Button>
          <Button variant="ghost" className="w-full justify-start">
            New Case
          </Button>
        </div>

        <div className="border-t border-border -mx-3 mb-2" />
        <div className="flex items-center justify-center pb-2">
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
      </aside>
  );
}