'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MessageCircle, X, MessageSquare, Mail } from 'lucide-react'

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
    <>
      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-opacity-50 z-40"
          onClick={() => setIsOpen(!isOpen)}
        />
      )}

      {/* Feedback options card */}
      {isOpen && (
        <div className="fixed bottom-18 right-6 z-50">
          <Card className="shadow-xl border-0 w-72 gap-0 outline">
            <CardHeader className="">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Share Feedback</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  className="h-6 w-6 p-0"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Google Form Option */}
              <Button
                onClick={handleGoogleForm}
                variant="outline"
                className="w-full justify-start"
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Fill a Form
              </Button>

                <Button
                    onClick={handleWhatsApp}
                    variant="outline"
                    className="w-full justify-start"
                >
                    <MessageCircle className="w-4 h-4 mr-2" />
                    Have a Chat!
                </Button>
                <Button
                    onClick={handleEmail}
                    variant="outline"
                    className="w-full justify-start"
                >
                    <Mail className="w-4 h-4 mr-2" />
                    Send an Email
                </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Floating feedback button */}
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          onClick={() => setIsOpen(true)}
          className="rounded-full shadow-lg hover:shadow-xl transition-all duration-200 bg-green-500 hover:bg-green-700 cursor-pointer"
          size="lg"
          title="Share feedback about this course planner"
        >
          <MessageCircle className="w-5 h-5 mr-2" />
          <span className="hidden sm:inline">Feedback</span>
        </Button>
      </div>
    </>
  )
}
