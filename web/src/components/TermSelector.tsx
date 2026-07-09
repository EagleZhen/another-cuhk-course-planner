'use client'

import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { extractAcademicYearCode } from '@/lib/courseUtils'

// Two looks: an inline text link (in the search bar) and an outline button (on
// the calendar). Each variant also fixes the popover's alignment and z-order.
type Variant = 'link' | 'button'

const VARIANTS: Record<
  Variant,
  { triggerOpen: string; backdropZ: string; menuZ: string; align: string }
> = {
  link: {
    triggerOpen: 'relative z-50 bg-blue-50',
    backdropZ: 'z-40',
    menuZ: 'z-50',
    align: 'left-0',
  },
  button: {
    triggerOpen: 'relative z-[60]',
    backdropZ: 'z-[55]',
    menuZ: 'z-[60]',
    align: 'right-0',
  },
}

function SelectMenu({
  label,
  title,
  options,
  selected,
  onSelect,
  formatOption,
  variant,
  minWidth,
}: {
  label: string
  title: string
  options: readonly string[]
  selected: string
  onSelect: (value: string) => void
  formatOption?: (value: string) => string
  variant: Variant
  minWidth: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const cfg = VARIANTS[variant]

  return (
    <div className="relative">
      {variant === 'button' ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center gap-2 cursor-pointer ${isOpen ? cfg.triggerOpen : ''}`}
          title={title}
        >
          <span className="text-sm">{label}</span>
          <ChevronDown className="w-3 h-3" />
        </Button>
      ) : (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 hover:text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-colors cursor-pointer ${isOpen ? cfg.triggerOpen : ''}`}
          title={title}
        >
          <span>{label}</span>
          <ChevronDown className="w-3 h-3" />
        </button>
      )}

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className={`fixed inset-0 ${cfg.backdropZ} cursor-pointer`}
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div
            className={`absolute ${cfg.align} top-full mt-1 ${cfg.menuZ} bg-white border border-gray-200 rounded-md shadow-lg ${minWidth}`}
          >
            <div className="py-1">
              {options.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`block w-full text-left px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer ${
                    option === selected ? 'bg-blue-50 text-blue-600' : 'text-gray-900'
                  }`}
                  onClick={() => {
                    onSelect(option)
                    setIsOpen(false)
                  }}
                >
                  {formatOption ? formatOption(option) : option}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

interface TermSelectorProps {
  selectedTerm: string
  availableTerms: readonly string[]
  onTermChange?: (term: string) => void
  variant?: Variant
}

/**
 * Year + term selector. Splits the flat term list into a year dimension (shown
 * only when more than one year is published) and the selected year's terms;
 * switching year lands on that year's first term.
 */
export function TermSelector({
  selectedTerm,
  availableTerms,
  onTermChange,
  variant = 'link',
}: TermSelectorProps) {
  const selectedYear = extractAcademicYearCode(selectedTerm)
  const availableYears = useMemo(
    () =>
      Array.from(new Set(availableTerms.map(extractAcademicYearCode)))
        .sort()
        .reverse(),
    [availableTerms]
  )
  const termsInSelectedYear = useMemo(
    () => availableTerms.filter((term) => extractAcademicYearCode(term) === selectedYear),
    [availableTerms, selectedYear]
  )
  const showYear = availableYears.length > 1
  // With a separate year selector, term labels drop the redundant year prefix.
  const formatTermLabel = (term: string) =>
    showYear ? term.replace(extractAcademicYearCode(term), '').trim() : term

  if (!onTermChange || availableTerms.length === 0) {
    return <strong>{selectedTerm}</strong>
  }

  const handleYearChange = (year: string) => {
    const firstTerm = availableTerms.find((term) => extractAcademicYearCode(term) === year)
    if (firstTerm) onTermChange(firstTerm)
  }

  return (
    <span className="inline-flex items-center gap-1">
      {showYear && (
        <SelectMenu
          variant={variant}
          title="Click to change academic year"
          label={selectedYear}
          options={availableYears}
          selected={selectedYear}
          onSelect={handleYearChange}
          minWidth="min-w-[140px]"
        />
      )}
      <SelectMenu
        variant={variant}
        title="Click to change term"
        label={formatTermLabel(selectedTerm)}
        options={termsInSelectedYear}
        selected={selectedTerm}
        onSelect={onTermChange}
        formatOption={formatTermLabel}
        minWidth="min-w-[250px]"
      />
    </span>
  )
}
