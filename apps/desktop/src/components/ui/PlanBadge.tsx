import { useSubscriptionTier } from "@/lib/featureGating";

export default function PlanBadge() {
  const tier = useSubscriptionTier();
  const isPro = tier === "pro";

  return (
    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider align-middle bg-white text-gray-500 border border-border">
      {isPro ? "Pro" : "Free"}
    </span>
  );
}
