import { Sparkles } from "lucide-react";

type ComingSoonProps = {
  feature: string;
};

export default function ComingSoon({ feature }: ComingSoonProps) {
  return (
    <div className="max-w-2xl mx-auto px-6 py-24 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground mb-4">
        <Sparkles className="h-6 w-6" />
      </span>
      <h1 className="text-xl font-bold text-foreground">{feature} is coming soon</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This part of Ascurix is still being built. Check back soon.
      </p>
    </div>
  );
}
