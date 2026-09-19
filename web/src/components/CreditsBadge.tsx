'use client'

import { Info } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatCredits } from '@/lib/courseUtils'
import type { Credits } from '@/lib/types'

// The search card and its detail panel, shared so the two can't drift. Not the cart, which
// shows credits as plain text beside the course code.
export function CreditsBadge({ credits }: { credits?: Credits }) {
  if (!credits) return null

  return (
    <a
      href="https://www.oalglobal.cuhk.edu.hk/academics/#:~:text=At%20CUHK%2C%20one%20credit%20or,one%20of%20tutorials%20each%20week."
      target="_blank"
      rel="noopener noreferrer"
      className="inline-block"
    >
      <Badge
        variant="secondary"
        className="cursor-pointer hover:bg-gray-200 transition-colors flex items-center gap-1"
        title="At CUHK, 1 credit ≈ 1 hour of instruction per week. Most 3-unit courses consist of 3 hours of lectures or 2 hours of lectures and 1 hour of tutorials each week."
      >
        {formatCredits(credits)} credits
        <Info className="w-2.5 h-2.5 opacity-60" />
      </Badge>
    </a>
  )
}
