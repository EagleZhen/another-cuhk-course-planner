'use client'

import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatCredits } from '@/lib/courseUtils'
import type { Credits } from '@/lib/types'

// A course fact linking to the CUHK page that explains it. Shared so the card's desktop and
// mobile layouts can't drift. Not the cart, whose h-5 row fits neither this padding nor a
// nested link.
function InfoBadge({
  href,
  title,
  children,
}: {
  href: string
  title: string
  children: ReactNode
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-block">
      <Badge
        variant="secondary"
        className="cursor-pointer hover:bg-gray-200 transition-colors flex items-center gap-1"
        title={title}
      >
        {children}
        <Info className="w-2.5 h-2.5 opacity-60" />
      </Badge>
    </a>
  )
}

export function CreditsBadge({ credits }: { credits?: Credits }) {
  if (!credits) return null

  return (
    <InfoBadge
      href="https://www.oalglobal.cuhk.edu.hk/academics/#:~:text=At%20CUHK%2C%20one%20credit%20or,one%20of%20tutorials%20each%20week."
      title="At CUHK, 1 credit ≈ 1 hour of instruction per week. Most 3-unit courses consist of 3 hours of lectures or 2 hours of lectures and 1 hour of tutorials each week."
    >
      {formatCredits(credits)} credits
    </InfoBadge>
  )
}

export function GradingBadge({ gradingBasis }: { gradingBasis?: string }) {
  if (!gradingBasis) return null

  return (
    <InfoBadge
      href="https://www.res.cuhk.edu.hk/general-information/grading-system-of-undergraduate-programmes/"
      title="Click to learn about CUHK grading systems"
    >
      {gradingBasis}
    </InfoBadge>
  )
}
