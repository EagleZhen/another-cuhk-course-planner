import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

type MenuItemProps = ComponentProps<'button'> & {
  selected?: boolean
}

// Shares item appearance; menu dismissal and focus management belong to the parent.
function MenuItem({ selected = false, className, ...props }: MenuItemProps) {
  return (
    <button
      type="button"
      data-slot="menu-item"
      className={cn(
        'inline-flex w-full items-center justify-start gap-2 whitespace-normal px-3 py-2 text-left text-sm font-normal [&>svg]:shrink-0',
        'cursor-pointer transition-colors',
        'outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'disabled:pointer-events-none disabled:opacity-50',
        selected
          ? 'bg-blue-50 text-blue-600 hover:bg-blue-100 active:bg-blue-200'
          : 'text-gray-900 hover:bg-gray-100 active:bg-gray-200',
        className
      )}
      {...props}
    />
  )
}

export { MenuItem }
