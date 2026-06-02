import { useEffect, useRef, useState, type TransitionEvent } from "react";
import { motionUnmountDelay, type MotionPhase } from "@/lib/motion";

type UseMotionPhaseOptions = {
  open: boolean;
  durationMs?: number;
};

/**
 * Drives enter → idle → exit phases for CSS transitions before unmounting.
 */
export function useMotionPhase({ open, durationMs = motionUnmountDelay() }: UseMotionPhaseOptions) {
  const [mounted, setMounted] = useState(open);
  const [phase, setPhase] = useState<MotionPhase>(open ? "enter" : "exit");
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
      setMounted(true);
      setPhase("enter");
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => setPhase("idle"));
      });
      return () => cancelAnimationFrame(frame);
    }

    if (!mounted) {
      return;
    }

    setPhase("exit");
    exitTimerRef.current = setTimeout(() => {
      setMounted(false);
      exitTimerRef.current = null;
    }, durationMs);

    return () => {
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
    };
  }, [open, mounted, durationMs]);

  function handleTransitionEnd(event: TransitionEvent) {
    if (phase !== "exit" || event.propertyName === "visibility") {
      return;
    }
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    setMounted(false);
  }

  return { mounted, phase, handleTransitionEnd };
}
