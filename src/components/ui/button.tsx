import { Slot } from "@radix-ui/react-slot";
import { clsx } from "clsx";
import type { ButtonHTMLAttributes } from "react";
export function Button({
  asChild = false,
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const C = asChild ? Slot : "button";
  return <C className={clsx("button", variant, className)} {...props} />;
}
