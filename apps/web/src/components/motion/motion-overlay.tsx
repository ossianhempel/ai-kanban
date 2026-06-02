import type { ReactNode } from "react";
import { motionClass } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useMotionPhase } from "./use-motion-phase";

type MotionOverlayProps = {
  open: boolean;
  onClose: () => void;
  className?: string;
  "aria-label"?: string;
};

export function MotionOverlay({
  open,
  onClose,
  className,
  "aria-label": ariaLabel = "Close",
}: MotionOverlayProps) {
  const { mounted, phase, handleTransitionEnd } = useMotionPhase({ open });

  if (!mounted) {
    return null;
  }

  return (
    <button
      type="button"
      data-phase={phase}
      aria-label={ariaLabel}
      className={cn(
        "fixed inset-0 z-40 bg-black/40",
        motionClass.overlay,
        className,
      )}
      onClick={onClose}
      onTransitionEnd={handleTransitionEnd}
    />
  );
}

type MotionSlidePanelProps = {
  open: boolean;
  children: ReactNode;
  className?: string;
  side?: "right" | "left";
};

export function MotionSlidePanel({
  open,
  children,
  className,
  side = "right",
}: MotionSlidePanelProps) {
  const { mounted, phase, handleTransitionEnd } = useMotionPhase({ open });

  if (!mounted) {
    return null;
  }

  return (
    <div
      data-phase={phase}
      data-side={side}
      onTransitionEnd={handleTransitionEnd}
      className={cn(
        "fixed inset-y-0 z-50 flex w-full max-w-md flex-col border-[var(--color-border)] bg-[var(--color-bg-elevated)]",
        side === "right" ? "right-0 border-l" : "left-0 border-r",
        motionClass.slidePanel,
        className,
      )}
    >
      {children}
    </div>
  );
}
