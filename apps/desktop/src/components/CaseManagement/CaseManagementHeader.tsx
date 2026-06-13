export default function CasesManagementHader() {
  return (
    <header className="w-full py-4 px-6 border-b border-border">
      <div className="flex items-center justify-between mb-6">          
          <h1 className="text-2xl font-semibold">Case Management</h1>
          <div className="flex items-center gap-4">
            {/* <span className="text-sm text-muted-foreground">{cases.length} total cases</span> */}
            {/* <Button onClick={addDummyCase}>+ Add Case</Button> */}
          </div>
        </div>
    </header>
  );
}