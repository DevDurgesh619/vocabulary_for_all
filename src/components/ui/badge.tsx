import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", {
  variants: {
    variant: {
      default: "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]",
      muted: "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]",
      success: "bg-[var(--color-success)]/15 text-[var(--color-success)]",
      warning: "bg-[var(--color-warning)]/20 text-[oklch(0.5_0.13_75)]",
      danger: "bg-[var(--color-danger)]/15 text-[var(--color-danger)]",
      outline: "border border-[var(--color-border)]",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
