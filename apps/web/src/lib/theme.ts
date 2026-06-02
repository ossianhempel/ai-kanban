export const fontSize = {
  xs: "12px",
  sm: "13px",
  md: "14px",
  lg: "16px",
  xl: "18px",
  "2xl": "24px",
} as const;

export const fontWeight = {
  regular: 400,
  medium: 500,
} as const;

export const iconStroke = {
  fine: 0.8,
  default: 1,
} as const;

export const motion = {
  duration: {
    fast: "var(--motion-duration-fast)",
    normal: "var(--motion-duration-normal)",
    slow: "var(--motion-duration-slow)",
  },
  ease: {
    out: "var(--motion-ease-out)",
    inOut: "var(--motion-ease-in-out)",
  },
} as const;
