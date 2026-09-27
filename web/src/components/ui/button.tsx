import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        // E.g. Add to Cart and selected filter chips.
        default:
          'bg-primary text-primary-foreground shadow-xs hover:bg-primary active:bg-primary/80 cursor-pointer',
        // E.g. Remove from Cart and Clear filters.
        destructive:
          'bg-destructive text-white shadow-xs hover:bg-destructive/90 active:bg-destructive/80 dark:hover:bg-destructive/70 dark:active:bg-destructive/80 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60 cursor-pointer',
        // E.g. term selectors and unselected filter chips.
        outline:
          'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground active:bg-border active:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 dark:active:bg-input/70 cursor-pointer',
        // E.g. disabled Add to Cart and Added status.
        secondary:
          'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80 active:bg-secondary/60 cursor-pointer',
        // E.g. ICS export and its dropdown chevron.
        ghost:
          'hover:bg-accent hover:text-accent-foreground active:bg-border active:text-accent-foreground dark:hover:bg-accent/50 dark:active:bg-accent cursor-pointer',
        // E.g. eye icons over timetable events.
        overlay:
          'bg-black/20 text-white backdrop-blur-sm hover:bg-white/40 active:bg-white/60 cursor-pointer',

        // E.g. Outline / Reviews / Past Papers and cart section arrows.
        'ghost-neutral':
          'hover:text-accent-foreground active:text-accent-foreground cursor-pointer text-muted-foreground hover:bg-gray-200 active:bg-gray-300 dark:hover:bg-gray-700 dark:active:bg-gray-600',
        // E.g. cart trash button.
        'ghost-danger':
          'cursor-pointer text-red-600 hover:bg-red-50 hover:text-red-700 active:bg-red-100 active:text-red-800 dark:text-red-400 dark:hover:bg-red-950 dark:hover:text-red-300 dark:active:bg-red-900 dark:active:text-red-200',
        // E.g. Review Changes / Dismiss All and replacement-section arrows.
        'ghost-warning':
          'cursor-pointer text-amber-800 hover:bg-amber-100 hover:text-amber-900 active:bg-amber-200 active:text-amber-950 dark:text-amber-300 dark:hover:bg-amber-950 dark:hover:text-amber-200 dark:active:bg-amber-900 dark:active:text-amber-100',
        // E.g. Feedback and successful copy state.
        positive:
          'shadow-xs cursor-pointer bg-green-600 text-white hover:bg-green-700 active:bg-green-800',
      },
      size: {
        default: 'h-9 px-2 py-2',
        sm: 'h-8 rounded-md gap-1.5 px-2',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

// Shared appearances live here; complete contextual palettes may stay at callers.
type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
