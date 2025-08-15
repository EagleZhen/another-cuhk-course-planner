'use client'

import React, { useState, useEffect } from 'react'
import { X } from 'lucide-react'

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
        className="bg-white rounded-xl shadow-2xl w-full mx-4 p-6 border border-gray-200 relative max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="text-center mb-4">
          <h2 className="text-lg font-bold text-gray-900 mb-2">Better Experience on Computer</h2>
          <p className="text-gray-600 text-sm">
            This tool works best on desktop with features like side-by-side layout, live preview, and better search.
          </p>
        </div>
        
        {/* Desktop Preview Image */}
        <div className="mb-4">
          <img 
            src="/og-image.png" 
            alt="Desktop view showing shopping cart and weekly calendar side by side"
            className="w-full rounded-lg border border-gray-200"
          />
        </div>
        
        {/* Actions */}
        <div className="space-y-2">
          <button
            onClick={dismissNotice}
            className="w-full px-4 py-2.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
          >
            Continue on mobile anyway
          </button>
          <button
            onClick={dismissNotice}
            className="w-full px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
          >
            Got it, thanks!
          </button>
        </div>
        
        {/* Close button */}
        <button
          onClick={dismissNotice}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-2"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}