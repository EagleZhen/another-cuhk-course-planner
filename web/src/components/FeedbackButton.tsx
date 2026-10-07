'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { MenuItem } from '@/components/ui/menu-item'
import { MessageCircle, MessageSquare, Mail } from 'lucide-react'

const feedbackMessage = encodeURIComponent(
  'Hi EZ! I tried your Another CUHK Course Planner and wanted to share some feedback:\n\n'
)
const emailSubject = encodeURIComponent('Another CUHK Course Planner Feedback')

export default function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <Button
        variant="positive"
        onClick={() => setIsOpen(!isOpen)}
        className={`rounded-full shadow-lg ${isOpen ? 'relative z-[60]' : ''}`}
        size="lg"
        title="Share feedback about this course planner"
      >
        <MessageCircle className="w-5 h-5" />
        <span className="hidden sm:inline">Feedback</span>
      </Button>

      {/* Keep destinations out of the DOM until opened; their values remain public in JS. */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-[55] cursor-pointer" onClick={() => setIsOpen(false)} />

          <div className="absolute bottom-full right-0 mb-2 z-[60] bg-white border border-gray-200 rounded-lg shadow-lg min-w-[240px]">
            <div className="p-2 border-b border-gray-100">
              <div className="text-sm font-medium text-gray-900">Share Feedback</div>
            </div>
            <div className="py-1">
              <MenuItem asChild>
                <a
                  href="https://docs.google.com/forms/d/e/1FAIpQLSdZKaf1DMjIrnfRTBzFPGqHSHXHBBKOQarrxQCRoj_uy-ZD1g/viewform"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsOpen(false)}
                >
                  <MessageSquare className="w-4 h-4 text-gray-500" />
                  Fill a Form
                </a>
              </MenuItem>
              <MenuItem asChild>
                <a
                  href={`https://wa.me/64886152?text=${feedbackMessage}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsOpen(false)}
                >
                  <MessageCircle className="w-4 h-4 text-gray-500" />
                  Have a Chat!
                </a>
              </MenuItem>
              <MenuItem asChild>
                <a
                  href={`mailto:1155194751@link.cuhk.edu.hk?subject=${emailSubject}&body=${feedbackMessage}`}
                  target="_self"
                  onClick={() => setIsOpen(false)}
                >
                  <Mail className="w-4 h-4 text-gray-500" />
                  Send an Email
                </a>
              </MenuItem>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
