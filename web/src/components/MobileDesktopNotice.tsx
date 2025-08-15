'use client'

import React, { useState, useEffect } from 'react'
import { Monitor } from 'lucide-react'

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
      style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0, 0, 0, 0.1)' }}
      onClick={dismissNotice}
    >
      <div 
        className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl w-full mx-4 p-6 border border-white/20 relative max-h-[90vh] overflow-y-auto"
        style={{ backdropFilter: 'blur(20px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="text-center mb-4">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Monitor className="w-4 h-4 text-blue-600" />
            <h2 className="text-base font-bold text-gray-900">Better on Computer</h2>
          </div>
          <p className="text-gray-600 text-sm">
            This tool works best on desktop with side-by-side layout, live preview, and clearer display of course information.
          </p>
        </div>
        
        {/* Desktop Preview Image */}
        <div className="mb-4">
          <div className="w-full aspect-[1200/630] bg-gray-100 rounded-lg border border-gray-200 overflow-hidden">
            <img 
              src="/og-image.png" 
              alt="Desktop view showing shopping cart and weekly calendar side by side"
              className="w-full h-full object-cover"
            />
          </div>
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
      </div>
    </div>
  )
}