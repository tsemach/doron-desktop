import { useCallback, useEffect, useState } from "react";

export type SplitPaneAxis = "horizontal" | "vertical";

interface UseSplitPaneOptions {
  /** Element the pointer position is measured against while dragging. */
  containerId: string;
  initialPercent: number;
  minPercent: number;
  maxPercent: number;
  /**
   * "horizontal" measures left-to-right and sizes the leading pane.
   * "vertical" measures from the container's bottom edge upwards, so the
   * percentage describes the height of the bottom pane.
   */
  axis?: SplitPaneAxis;
}

interface UseSplitPaneResult {
  percent: number;
  isDragging: boolean;
  startDragging: () => void;
}

/**
 * Drives a draggable split-pane divider. The window listeners are a genuine
 * subscription to an external system, so they stay in an Effect, but they are
 * bound only while a drag is in progress and torn down as soon as it ends.
 */
export function useSplitPane({
  containerId,
  initialPercent,
  minPercent,
  maxPercent,
  axis = "horizontal",
}: UseSplitPaneOptions): UseSplitPaneResult {
  const [percent, setPercent] = useState(initialPercent);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = document.getElementById(containerId);
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const raw =
        axis === "horizontal"
          ? ((e.clientX - rect.left) / rect.width) * 100
          : ((rect.height - (e.clientY - rect.top)) / rect.height) * 100;
      setPercent(Math.max(minPercent, Math.min(maxPercent, raw)));
    };

    const handleMouseUp = () => setIsDragging(false);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, containerId, axis, minPercent, maxPercent]);

  const startDragging = useCallback(() => setIsDragging(true), []);

  return { percent, isDragging, startDragging };
}
