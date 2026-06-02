import type { ReactNode } from "react";
import { useId } from "react";
import { motionClass } from "@/lib/motion";
import { cn } from "@/lib/utils";

type MotionCollapseProps = {
  open: boolean;
  children: ReactNode;
  className?: string;
  id?: string;
};

/** Height animation for conditional blocks (hints, expanded sections). */
export function MotionCollapse({ open, children, className, id }: MotionCollapseProps) {
  const generatedId = useId();
  const regionId = id ?? generatedId;

  return (
    <div
      id={regionId}
      data-open={open ? "true" : "false"}
      aria-hidden={!open}
      className={cn(motionClass.collapse, className)}
    >
      <div className={motionClass.collapseInner}>{children}</div>
    </div>
  );
}
