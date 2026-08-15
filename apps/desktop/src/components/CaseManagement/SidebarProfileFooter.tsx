export default function SidebarProfileFooter() {
  const displayName = localStorage.getItem("user_name");

  return (
    <div>
      <div className="border-t border-border -mx-2" />
      <div className="flex items-center justify-center py-2">
        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
          </svg>
        </div>
      </div>
      <div className="border-t border-border -mx-2 mb-2" />
      <div className="flex items-center justify-center pb-2 pt-2">
        <span className="text-xs text-muted-foreground">{displayName}</span>
      </div>
    </div>
  );
}
