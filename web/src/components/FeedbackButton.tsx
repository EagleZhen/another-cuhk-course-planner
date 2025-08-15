'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { MessageCircle, MessageSquare, Mail } from 'lucide-react'

export default function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false)

  const handleGoogleForm = () => {
    window.open('https://docs.google.com/forms/d/e/1FAIpQLSdZKaf1DMjIrnfRTBzFPGqHSHXHBBKOQarrxQCRoj_uy-ZD1g/viewform', '_blank', 'noopener,noreferrer')
    setIsOpen(false)
  }

  const handleWhatsApp = () => {
    const message = encodeURIComponent("Hi EZ! I tried your Another CUHK Course Planner and wanted to share some feedback:\n\n")
    window.open(`https://wa.me/64886152?text=${message}`, '_blank', 'noopener,noreferrer')
    setIsOpen(false)
  }

  const handleEmail = () => {
    const subject = encodeURIComponent("Another CUHK Course Planner Feedback")
    const body = encodeURIComponent("Hi EZ! I tried your Another CUHK Course Planner and wanted to share some feedback:\n\n")
    window.open(`mailto:1155194751@link.cuhk.edu.hk?subject=${subject}&body=${body}`, '_self')
    setIsOpen(false)
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <Button
        onClick={() => setIsOpen(!isOpen)}
        className={`rounded-full shadow-lg hover:shadow-xl transition-shadow duration-200 bg-green-500 hover:bg-green-700 ${isOpen ? 'relative z-[60]' : ''}`}
        size="lg"
        title="Share feedback about this course planner"
      >
        <MessageCircle className="w-5 h-5" />
        <span className="hidden sm:inline">Feedback</span>
      </Button>
      
      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-[55] cursor-pointer" 
            onClick={() => setIsOpen(false)}
          />
          
          <div className="absolute bottom-full right-0 mb-2 z-[60] bg-white border border-gray-200 rounded-lg shadow-lg min-w-[240px]">
            <div className="p-2 border-b border-gray-100">
              <div className="text-sm font-medium text-gray-900">Share Feedback</div>
            </div>
            <div className="py-1">
              <button
                type="button"
                className="flex items-center w-full text-left px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer text-gray-900"
                onClick={handleGoogleForm}
              >
                <MessageSquare className="w-4 h-4 mr-2 text-gray-500" />
                Fill a Form
              </button>
              <button
                type="button"
                className="flex items-center w-full text-left px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer text-gray-900"
                onClick={handleWhatsApp}
              >
                <MessageCircle className="w-4 h-4 mr-2 text-gray-500" />
                Have a Chat!
              </button>
              <button
                type="button"
                className="flex items-center w-full text-left px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer text-gray-900"
                onClick={handleEmail}
              >
                <Mail className="w-4 h-4 mr-2 text-gray-500" />
                Send an Email
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
