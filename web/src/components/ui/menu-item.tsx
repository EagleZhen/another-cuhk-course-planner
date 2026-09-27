import type { ComponentProps } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type MenuItemProps = Omit<ComponentProps<typeof Button>, 'variant' | 'size' | 'asChild'> & {
  selected?: boolean
}

// Shares item appearance; menu dismissal and focus management belong to the parent.
function MenuItem({ selected = false, className, ...props }: MenuItemProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      className={cn(
        'h-auto w-full justify-start whitespace-normal rounded-none px-3 py-2 text-left font-normal hover:bg-gray-100 active:bg-gray-100',
        selected
          ? 'bg-blue-50 text-blue-600 hover:text-blue-600 active:text-blue-600'
          : 'text-gray-900 hover:text-gray-900 active:text-gray-900',
        className
      )}
      {...props}
    />
  )
}

export { MenuItem }
