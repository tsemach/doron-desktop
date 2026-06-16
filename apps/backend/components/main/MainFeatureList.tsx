type MainFreatureListProps = {
  onFeatureSelect: (featureTitle: string, featureId: string) => void;
}

export default function MainFeatureList({onFeatureSelect}: MainFreatureListProps) {
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
      <h3 className="text-xs font-bold text-slate-800 border-b border-slate-100 pb-2">
        Key Features
      </h3>
      <div className="flex flex-col gap-3.5">
        {features.map((feature, i) => (
          <div 
            key={i} 
            className="flex gap-2.5 items-start p-2 rounded-lg hover:bg-slate-200 hover:shadow-xs transition-all cursor-pointer"
            onClick={() => handleFeatureSelect(i)}
          >
            <div className="w-5 h-5 rounded bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shrink-0 text-xs mt-0.5 font-bold">
              ✓
            </div>
            <div className="space-y-0.5">
              <h4 className="text-base font-bold text-slate-800">{feature.title}</h4>
              <p className="text-base text-slate-500 leading-normal">{feature.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}