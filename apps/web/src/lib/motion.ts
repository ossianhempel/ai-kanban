/** Shared motion tokens — keep durations/easing consistent across the app. */
export const motionDuration = {
  fast: 150,
  normal: 220,
  slow: 320,
} as const;

export const motionEase = {
  out: "cubic-bezier(0.16, 1, 0.3, 1)",
  inOut: "cubic-bezier(0.45, 0, 0.55, 1)",
} as const;

/** CSS class presets (defined in index.css). */
export const motionClass = {
  overlay: "motion-overlay",
  slidePanel: "motion-slide-panel",
  fadeIn: "motion-fade-in",
  fadeInUp: "motion-fade-in-up",
  collapse: "motion-collapse",
  collapseInner: "motion-collapse-inner",
  field: "motion-field",
  pressable: "motion-pressable",
  surface: "motion-surface",
} as const;

export type MotionPhase = "enter" | "idle" | "exit";

/** Fallback unmount delay if transitionend does not fire. */
export function motionUnmountDelay(preset: keyof typeof motionDuration = "normal"): number {
  return motionDuration[preset] + 40;
}
