import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function createIcon(raw: string) {
  return function Icon({
    size = 24,
    className,
    ...props
  }: HTMLAttributes<HTMLSpanElement> & { size?: number }) {
    const svg = raw.replace("<svg ", `<svg width="${size}" height="${size}" `);

    return (
      <span
        {...props}
        className={cn("inline-flex shrink-0 [&>svg]:size-full", className)}
        style={{ width: size, height: size }}
        aria-hidden
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  };
}
