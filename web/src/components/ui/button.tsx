import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-xs hover:bg-primary active:bg-primary/80 cursor-pointer',
        destructive:
          'bg-destructive text-white shadow-xs hover:bg-destructive/90 active:bg-destructive/80 dark:hover:bg-destructive/70 dark:active:bg-destructive/80 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60 cursor-pointer',
        outline:
          'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground active:bg-border active:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 dark:active:bg-input/70 cursor-pointer',
        secondary:
          'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80 active:bg-secondary/60 cursor-pointer',
        ghost:
          'hover:bg-accent hover:text-accent-foreground active:bg-border active:text-accent-foreground dark:hover:bg-accent/50 dark:active:bg-accent cursor-pointer',
        overlay:
          'bg-black/20 text-white backdrop-blur-sm hover:bg-white/40 active:bg-white/60 cursor-pointer',
        link: 'text-primary underline-offset-4 hover:underline active:text-primary/70 active:underline cursor-pointer',
      },
      tone: {
        neutral:
          'text-muted-foreground hover:bg-gray-200 active:bg-gray-300 dark:hover:bg-gray-700 dark:active:bg-gray-600',
        danger:
          'text-red-600 hover:bg-red-50 hover:text-red-700 active:bg-red-100 active:text-red-800 dark:text-red-400 dark:hover:bg-red-950 dark:hover:text-red-300 dark:active:bg-red-900 dark:active:text-red-200',
        warning:
          'text-amber-800 hover:bg-amber-100 hover:text-amber-900 active:bg-amber-200 active:text-amber-950 dark:text-amber-300 dark:hover:bg-amber-950 dark:hover:text-amber-200 dark:active:bg-amber-900 dark:active:text-amber-100',
        positive: 'bg-green-600 text-white hover:bg-green-700 active:bg-green-800',
        conflict:
          'border-purple-300 text-purple-700 hover:bg-purple-50 hover:text-purple-800 active:bg-purple-100 active:text-purple-900 dark:border-purple-700 dark:text-purple-300 dark:hover:bg-purple-950 dark:hover:text-purple-200 dark:active:bg-purple-900 dark:active:text-purple-100',
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

// Keep interaction colors here; callers choose an appearance and supply layout.
type ButtonAppearance =
  | { variant?: VariantProps<typeof buttonVariants>['variant']; tone?: never }
  | { variant: 'ghost'; tone: 'neutral' | 'danger' | 'warning' }
  | { variant?: 'default'; tone?: 'positive' }
  | { variant: 'outline'; tone: 'conflict' }

type ButtonProps = React.ComponentProps<'button'> &
  Pick<VariantProps<typeof buttonVariants>, 'size'> &
  ButtonAppearance & { asChild?: boolean }

function Button({ className, variant, tone, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, tone, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
