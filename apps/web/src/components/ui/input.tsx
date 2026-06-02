import * as React from "react";
import { motionClass } from "@/lib/motion";
import { cn } from "@/lib/utils";

const fieldClassName = cn(
  "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 text-[length:var(--text-sm)] text-[var(--color-text-strong)] outline-none placeholder:text-[var(--color-text-subtle)] focus:border-[var(--color-border-strong)]",
  motionClass.field,
);

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClassName, "h-8", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldClassName, "min-h-20 py-2", className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldClassName, "h-8", className)} {...props} />;
}
