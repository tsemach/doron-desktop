type MainFreatureListProps = {
  activeFeatureId: string;
  onFeatureSelect: (featureTitle: string, featureId: string) => void;
}

export default function MainFeatureList({ activeFeatureId, onFeatureSelect }: MainFreatureListProps) {
  const features = [
    {
      id: "central-working-space",
      title: "Central Working Space",
      desc: "A single consolidated control panel to manage cases, view documents, sync emails, and configure preferences.",
    },
    {
      id: "case-management-tracking",
      title: "Case Management & Tracking",
      desc: "Organize active legal/business cases, record client metadata, and track statuses seamlessly.",
    },
    {
      id: "ai-document-indexing",
      title: "AI Document Indexing",
      desc: "Auto-extract titles, summaries, dates, and topics from Word, PDF, and Excel files using Claude API.",
    },
    {
      id: "smart-full-text-search",
      title: "Smart Full-Text Search",
      desc: "Perform lightning-fast, index-wide searches over document texts and metadata attributes.",
    },
    {
      id: "document-tags-notes",
      title: "Document Tags & Notes",
      desc: "Annotate cases and files with custom descriptions, flags, and tags to keep folders organized.",
    },
    {
      id: "email-correspondences-sync",
      title: "Email Correspondences Sync",
      desc: "Direct IMAP sync that matches incoming emails and attachments to their corresponding cases.",
    },
  ];

  const handleFeatureSelect = (featureIndex: number) => {
    console.log(`Selected feature: ${features[featureIndex].title}, feature id: ${features[featureIndex].id}`);
    onFeatureSelect(features[featureIndex].title, features[featureIndex].id);
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-sm space-y-4">
      <h3 className="text-xs font-bold text-slate-400 border-b border-slate-100 pb-2 uppercase tracking-wider">
        Key Features
      </h3>
      <div className="flex flex-col gap-2">
        {features.map((feature, i) => {
          const isActive = feature.id === activeFeatureId;
          return (
            <div 
              key={i} 
              className={`flex gap-3 items-start p-3 rounded-lg transition-all duration-200 cursor-pointer border ${
                isActive 
                  ? "bg-blue-50/50 border-blue-200/60 shadow-xs translate-x-1" 
                  : "bg-transparent border-transparent hover:bg-slate-50 hover:translate-x-0.5"
              }`}
              onClick={() => handleFeatureSelect(i)}
            >
              <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 text-[10px] mt-0.5 font-bold transition-colors ${
                isActive
                  ? "bg-blue-600 border border-blue-600 text-white"
                  : "bg-slate-50 border border-slate-200 text-slate-400"
              }`}>
                ✓
              </div>
              <div className="space-y-0.5">
                <h4 className={`text-sm font-bold transition-colors ${
                  isActive ? "text-blue-900" : "text-slate-800"
                }`}>{feature.title}</h4>
                <p className={`text-xs leading-relaxed transition-colors ${
                  isActive ? "text-blue-750" : "text-slate-500"
                }`}>{feature.desc}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  )
}