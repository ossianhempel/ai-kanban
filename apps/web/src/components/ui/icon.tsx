import type { ComponentType, SVGProps } from "react";
import { iconStroke } from "@/lib/theme";
import { cn } from "@/lib/utils";

type NucleoIconComponent = ComponentType<
  SVGProps<SVGSVGElement> & {
    size?: number | string;
    strokeWidth?: number | string;
  }
>;

type IconProps = {
  icon: NucleoIconComponent;
  size?: number;
  stroke?: keyof typeof iconStroke | number;
  className?: string;
  label?: string;
};

export function Icon({ icon: IconComponent, size = 18, stroke = "default", className, label }: IconProps) {
  const strokeWidth = typeof stroke === "number" ? stroke : iconStroke[stroke];

  return (
    <IconComponent
      size={size}
      strokeWidth={strokeWidth}
      className={cn("shrink-0 text-current", className)}
      aria-hidden={label ? undefined : true}
      aria-label={label}
    />
  );
}
