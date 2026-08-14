import type { ReactNode } from "react";

type RailColor = "emerald" | "amber" | "rose" | "slate" | "blue";

const RAIL_COLOR_CLASSES: Record<RailColor, string> = {
  emerald: "border-emerald-500",
  amber: "border-amber-500",
  rose: "border-rose-500",
  slate: "border-slate-300",
  blue: "border-blue-500",
};

type StatusRailProps = {
  color: RailColor;
  children: ReactNode;
};

export default function StatusRail({ color, children }: StatusRailProps) {
  return <div className={`border-l-4 pl-3 ${RAIL_COLOR_CLASSES[color]}`}>{children}</div>;
}
