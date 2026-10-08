import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow",
        outline: "text-foreground",
        // RentTrack domain statuses (spec section 65)
        paid: "border-transparent bg-status-paid/15 text-status-paid border-status-paid/30",
        partial:
          "border-transparent bg-status-partial/15 text-status-partial border-status-partial/30",
        due: "border-transparent bg-status-due/15 text-status-due border-status-due/30",
        available:
          "border-transparent bg-status-available/15 text-status-available border-status-available/30",
        info: "border-transparent bg-status-info/15 text-status-info border-status-info/30",
        neutral:
          "border-transparent bg-status-neutral/15 text-status-neutral border-status-neutral/30",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
