import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/15 text-primary",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive/15 text-destructive",
        outline: "border-border text-muted-foreground",
        success: "border-transparent bg-green-400/15 text-green-400",
        warning: "border-transparent bg-yellow-400/15 text-yellow-400",
        info: "border-transparent bg-sky-400/15 text-sky-400",
        critical: "border-red-400/20 bg-red-400/10 text-red-400",
        high: "border-orange-400/20 bg-orange-400/10 text-orange-400",
        medium: "border-yellow-400/20 bg-yellow-400/10 text-yellow-400",
        low: "border-green-400/20 bg-green-400/10 text-green-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
