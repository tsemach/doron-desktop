export default function ResizeGrabGrip() {
  return (
    <div className="absolute bottom-1 right-1 pointer-events-none text-muted-foreground/40">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
        <line x1="1" y1="9" x2="9" y2="1" />
        <line x1="4" y1="9" x2="9" y2="4" />
        <line x1="7" y1="9" x2="9" y2="7" />
      </svg>
    </div>
  );
}
