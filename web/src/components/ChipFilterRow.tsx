import { Button } from '@/components/ui/button'

interface ChipFilterRowProps<T> {
  label: string
  options: T[]
  getKey: (value: T) => string | number
  getLabel: (value: T) => string
  isSelected: (value: T) => boolean
  onToggle: (value: T) => void
  onClear: () => void
  clearLabel: string
  /** Shown in place of the chips when there are no options. */
  emptyText: string
  /** Whether any value is selected (controls the Clear button). */
  hasSelection: boolean
  /** Tooltip per chip; `selected` is its current state. */
  toggleTitle?: (value: T, selected: boolean) => string
}

/** A labelled row of multi-select filter chips with a Clear button — used for the day and credit filters. */
export function ChipFilterRow<T>({
  label,
  options,
  getKey,
  getLabel,
  isSelected,
  onToggle,
  onClear,
  clearLabel,
  emptyText,
  hasSelection,
  toggleTitle,
}: ChipFilterRowProps<T>) {
  return (
    <div className="flex items-center gap-2 flex-wrap mt-2">
      <span className="text-sm font-medium text-gray-700">{label}</span>

      {options.length > 0 ? (
        options.map((value) => {
          const selected = isSelected(value)
          return (
            <Button
              key={getKey(value)}
              variant={selected ? 'default' : 'outline'}
              size="sm"
              onClick={() => onToggle(value)}
              className="h-6 px-2 text-xs font-normal border-1"
              title={toggleTitle?.(value, selected)}
            >
              {getLabel(value)}
            </Button>
          )
        })
      ) : (
        <span className="text-xs text-gray-400 italic">{emptyText}</span>
      )}

      {hasSelection && (
        <Button
          variant="destructive"
          size="sm"
          onClick={onClear}
          className="h-6 px-2 text-xs font-medium"
          title={clearLabel}
        >
          {clearLabel}
        </Button>
      )}
    </div>
  )
}
