import type { ReactNode } from "react";
import { motionClass } from "@/lib/motion";
import { cn } from "@/lib/utils";

type MotionInProps = {
  children: ReactNode;
  className?: string;
  variant?: "fade" | "fade-up";
};

/** Play a one-shot entrance animation when the element mounts. */
export function MotionIn({ children, className, variant = "fade-up" }: MotionInProps) {
  return (
    <div
      className={cn(variant === "fade" ? motionClass.fadeIn : motionClass.fadeInUp, className)}
    >
      {children}
    </div>
  );
}
