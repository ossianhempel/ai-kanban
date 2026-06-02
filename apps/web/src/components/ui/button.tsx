import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { motionClass } from "@/lib/motion";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  cn(
    "inline-flex items-center justify-center gap-1.5 rounded-md font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-border-strong)] disabled:pointer-events-none disabled:opacity-40",
    motionClass.pressable,
  ),
  {
    variants: {
      variant: {
        default:
          "bg-[var(--color-text-strong)] text-[var(--color-bg)] hover:bg-white",
        secondary:
          "border border-[var(--color-border)] bg-transparent text-[var(--color-text-default)] hover:bg-[var(--color-bg-selected)] hover:text-[var(--color-text-strong)]",
        ghost:
          "text-[var(--color-text-subtle)] hover:bg-[var(--color-bg-selected)] hover:text-[var(--color-text-strong)]",
      },
      size: {
        default: "h-8 px-3 text-[length:var(--text-sm)]",
        sm: "h-7 px-2.5 text-[length:var(--text-xs)]",
        lg: "h-9 px-4 text-[length:var(--text-base)]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
