'use client'

import React, { useState, useEffect } from 'react'
import { Monitor, X, Smartphone } from 'lucide-react'

export default function MobileDesktopNotice() {
  const [showNotice, setShowNotice] = useState(false)
  
  useEffect(() => {
    // Check if user is on mobile and hasn't seen the notice
    const isMobile = window.innerWidth < 768
    const hasSeenNotice = localStorage.getItem('desktop-notice-seen')
    
    if (isMobile && !hasSeenNotice) {
      setShowNotice(true)
    }
  }, [])
  
  const dismissNotice = () => {
    localStorage.setItem('desktop-notice-seen', 'true')
    setShowNotice(false)
  }
  
  if (!showNotice) return null
  
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={dismissNotice}
    >
      <div 
        className="bg-white rounded-lg shadow-2xl max-w-sm w-full p-6 border border-gray-400 relative max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Monitor className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">Better Experience on Computer</h3>
          </div>
          <button
            onClick={dismissNotice}
            className="text-gray-400 hover:text-gray-600 p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Content */}
        <div className="space-y-3 mb-6">
          <div className="flex items-start gap-3">
            <Smartphone className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-gray-700">
                This course planner is optimized for desktop use with features like:
              </p>
              <ul className="text-xs text-gray-600 mt-2 space-y-1 ml-2">
                <li>• Side-by-side shopping cart and weekly calendar</li>
                <li>• Live preview: cycle through sections and see calendar changes</li>
                <li>• Detailed course search with better information display</li>
              </ul>
            </div>
          </div>
        </div>
        
        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={dismissNotice}
            className="flex-1 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
          >
            Continue on mobile
          </button>
          <button
            onClick={dismissNotice}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}