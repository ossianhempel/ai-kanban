import * as React from "react";
import { cn } from "@/lib/utils";

const toneStyles = {
  default:
    "border-[var(--color-border)] bg-[var(--color-bg-selected)] text-[var(--color-text-default)]",
  success: "border-[var(--color-border)] bg-[var(--color-bg-selected)] text-[var(--color-success)]",
  warning: "border-[var(--color-border)] bg-[var(--color-bg-selected)] text-[var(--color-warning)]",
  danger: "border-[var(--color-border)] bg-[var(--color-bg-selected)] text-[var(--color-danger)]",
  muted: "border-[var(--color-border)] bg-transparent text-[var(--color-text-subtle)]",
} as const;

export function Badge({
  className,
  tone = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof toneStyles }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[length:var(--text-xs)] font-medium",
        toneStyles[tone],
        className,
      )}
      {...props}
    />
  );
}
