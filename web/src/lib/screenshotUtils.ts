/**
 * Screenshot utilities for calendar and course components
 * Extracted from courseUtils.ts for better separation of concerns
 */

/**
 * Captures a calendar screenshot with term name header and website attribution
 * Now supports compositing calendar and unscheduled sections together
 */
export async function captureCalendarScreenshot(
  calendarElement: HTMLElement,
  unscheduledElement: HTMLElement | null,
  termName: string,
  websiteUrl: string = typeof window !== 'undefined' ? window.location.origin : ''
): Promise<void> {
  const { toPng } = await import('html-to-image')
  
  // Store original state for restoration
  const originalStates: Array<{
    element: HTMLElement
    originalStyle: string
    originalContent?: { element: HTMLElement; originalText: string }[]
    originalClasses?: { element: HTMLElement; originalClass: string }[]
  }> = []

  // Helper to restore all elements to original state
  const restoreAllElements = () => {
    try {
      originalStates.forEach(state => {
        // Special case: if we triggered expansion, click again to collapse
        if (state.originalStyle === 'TRIGGERED_EXPANSION') {
          try {
            state.element.click() // Click again to return to collapsed state
          } catch (clickError) {
            console.warn('⚠️ Could not restore expansion state:', clickError)
          }
        } else {
          // Normal style restoration
          state.element.style.cssText = state.originalStyle
        }
        
        // Restore text content
        state.originalContent?.forEach(({ element, originalText }) => {
          element.textContent = originalText
        })
        
        // Restore class names
        state.originalClasses?.forEach(({ element, originalClass }) => {
          element.setAttribute('class', originalClass)
        })
      })
    } catch (restoreError) {
      console.warn('⚠️ Element restoration had issues:', restoreError)
    }
  }

  try {
    console.log('📸 Starting calendar screenshot...')
    
    // Helper to prepare element for screenshot capture
    const prepareElementForCapture = async (element: HTMLElement, isUnscheduled = false, calendarWidth?: number) => {
      const originalStyle = element.style.cssText
      const originalContent: Array<{ element: HTMLElement; originalText: string }> = []
      const originalClasses: Array<{ element: HTMLElement; originalClass: string }> = []
      
      // Store state for restoration
      originalStates.push({
        element,
        originalStyle,
        originalContent,
        originalClasses
      })
      
      // Expand element for capture
      element.style.maxHeight = 'none'
      element.style.height = 'auto'
      element.style.overflow = 'visible'
      element.style.overflowY = 'visible'
      
      if (isUnscheduled) {
        // Ensure parent container has enough padding for borders
        element.style.paddingRight = '32px' // Extra padding for right border visibility
        element.style.paddingBottom = '24px' // Increased padding
        element.style.width = 'auto' // Allow container to expand
        element.style.minWidth = '100%' // Ensure full width
        element.style.overflow = 'visible' // Ensure borders aren't clipped
        element.style.boxSizing = 'content-box' // Don't include padding in width calculation
      }
      
      if (isUnscheduled) {
        // Apply screenshot-optimized styling for calendar consistency
        const cardContainer = element.querySelector('.border.border-gray-200.rounded-lg.shadow-sm') as HTMLElement
        if (cardContainer) {
          const originalClass = cardContainer.getAttribute('class') || ''
          const originalStyle = cardContainer.style.cssText
          originalClasses.push({ element: cardContainer, originalClass })
          
          // Transform from card to distinct section with proper borders
          cardContainer.setAttribute('class', 'border border-gray-200 bg-white')
          
          // Align left border with time column's right border (30px from left)
          cardContainer.style.marginLeft = '30px'
          cardContainer.style.marginRight = '16px' // Increased margin to prevent right border clipping
          cardContainer.style.marginBottom = '16px' // Increased margin to prevent bottom border clipping
          cardContainer.style.boxSizing = 'border-box' // Include borders in width calculation
          
          // Set width based on calendar width if provided
          if (calendarWidth) {
            const availableWidth = calendarWidth - 30 - 16 // Calendar width minus left and right margins
            cardContainer.style.width = `${availableWidth}px`
            console.log(`📏 Set unscheduled container width: ${availableWidth}px during element preparation`)
          }
          
          // Store original style for restoration
          originalStates.push({
            element: cardContainer,
            originalStyle: originalStyle,
            originalContent: [],
            originalClasses: []
          })
        }
        
        // Hide interactive elements for professional look - target the specific ChevronDown from WeeklyCalendar
        const chevron = element.querySelector('svg.w-4.h-4.text-gray-400') as HTMLElement
        if (chevron) {
          const originalClass = chevron.getAttribute('class') || ''
          originalClasses.push({ element: chevron, originalClass })
          chevron.setAttribute('class', originalClass + ' hidden')
        } else {
          console.log('⚠️ ChevronDown icon not found with selector: svg.w-4.h-4.text-gray-400')
        }
        
        // Hide small preview cards in header for cleaner screenshot
        const previewCardsContainer = element.querySelector('.flex.gap-2.flex-wrap') as HTMLElement
        if (previewCardsContainer) {
          const originalContainerClass = previewCardsContainer.getAttribute('class') || ''
          originalClasses.push({ element: previewCardsContainer, originalClass: originalContainerClass })
          previewCardsContainer.setAttribute('class', originalContainerClass + ' hidden')
        }
        
        // Also hide individual preview cards as backup
        const previewCards = element.querySelectorAll('.flex.gap-2.flex-wrap span[class*="px-2 py-0.5"]')
        previewCards.forEach(card => {
          const cardElement = card as HTMLElement
          const originalClass = cardElement.getAttribute('class') || ''
          originalClasses.push({ element: cardElement, originalClass })
          cardElement.setAttribute('class', originalClass + ' hidden')
        })
        
        // Adjust course card widths for better screenshot proportions
        const courseCards = element.querySelectorAll('.flex.flex-wrap.gap-2 > div')
        courseCards.forEach(card => {
          const cardElement = card as HTMLElement
          const originalStyle = cardElement.style.cssText
          originalStates.push({
            element: cardElement,
            originalStyle,
            originalContent: [],
            originalClasses: []
          })
          
          // Make cards slightly narrower to prevent right border clipping
          cardElement.style.maxWidth = '160px' // Slightly reduced from 180px
          cardElement.style.minWidth = '140px' // Slightly reduced from 150px
        })
        
        // Force expand the main content - comprehensive approach
        let wasExpandedBefore = false
        
        // Check if content is currently expanded by looking for expanded content
        const expandableContent = element.querySelector('[class*="px-3"][class*="pb-3"]') as HTMLElement
        if (expandableContent) {
          wasExpandedBefore = getComputedStyle(expandableContent).display !== 'none' && 
                            expandableContent.style.display !== 'none'
        }
        
        // If not expanded, trigger expansion by clicking the expand trigger (REVERT TO WORKING APPROACH)
        if (!wasExpandedBefore) {
          const expandTrigger = element.querySelector('[class*="cursor-pointer"]') as HTMLElement
          if (expandTrigger) {
            // Simulate click to trigger React state change
            expandTrigger.click()
            
            // Wait for React to update the DOM
            await new Promise(resolve => setTimeout(resolve, 100))
            
            // Store that we triggered the expansion for restoration later
            originalStates.push({
              element: expandTrigger,
              originalStyle: 'TRIGGERED_EXPANSION', // Special marker
              originalContent: [],
              originalClasses: []
            })
          }
        }
        
        // Also ensure the expandable content is fully visible
        if (expandableContent) {
          const originalStyle = expandableContent.style.cssText
          originalStates.push({
            element: expandableContent,
            originalStyle,
            originalContent: [],
            originalClasses: []
          })
          
          // Force full expansion
          expandableContent.style.display = 'block'
          expandableContent.style.height = 'auto'
          expandableContent.style.overflow = 'visible'
          expandableContent.style.maxHeight = 'none'
        }
      }
      
      // Force layout recalculation
      void element.offsetHeight
      await new Promise(resolve => setTimeout(resolve, 50))
      
      const rect = element.getBoundingClientRect()
      return {
        element,
        actualWidth: Math.max(rect.width, 800),
        actualHeight: rect.height
      }
    }
    
    // Step 1: Prepare calendar
    console.log('📏 Preparing calendar...')
    const calendarInfo = await prepareElementForCapture(calendarElement, false)
    
    // Step 2: Prepare unscheduled (if it exists)
    let unscheduledInfo: {
      element: HTMLElement
      actualWidth: number
      actualHeight: number
    } | null = null
    if (unscheduledElement) {
      console.log('📏 Preparing unscheduled...')
      unscheduledInfo = await prepareElementForCapture(unscheduledElement, true, calendarInfo.actualWidth)
      // Match width to calendar for perfect alignment  
      unscheduledInfo.actualWidth = calendarInfo.actualWidth
    }
    
    // Step 2.5: Clear selection visual effects for clean screenshot (CSS only)
    if (unscheduledElement) {
      console.log('🧹 Clearing selection visual effects for clean screenshot...')
      // Find all selected course cards and remove visual selection effects
      const selectedCards = unscheduledElement.querySelectorAll('[class*="scale-105"], [class*="shadow-lg"]')
      console.log(`Found ${selectedCards.length} cards with selection effects to clear`)
      
      selectedCards.forEach(card => {
        const cardElement = card as HTMLElement
        const originalClass = cardElement.getAttribute('class') || ''
        
        // Store original for restoration
        originalStates.push({
          element: cardElement,
          originalStyle: cardElement.style.cssText,
          originalContent: [],
          originalClasses: [{ element: cardElement, originalClass }]
        })
        
        // Remove selection visual effects (scale, shadow) via CSS
        const cleanClass = originalClass
          .replace(/scale-105/g, 'scale-100')
          .replace(/shadow-lg/g, 'shadow-sm')
        cardElement.setAttribute('class', cleanClass)
        
        // Also force remove transform via CSS
        cardElement.style.transform = 'scale(1)'
      })
    }
    
    // Step 3: Capture images with proper error handling
    console.log('📷 Capturing images...')
    const calendarDataUrl = await toPng(calendarInfo.element, {
      quality: 1.0,
      backgroundColor: '#ffffff',
      pixelRatio: 3.0, // Reduced from 5.0 for better performance
      width: calendarInfo.actualWidth,
      height: calendarInfo.actualHeight,
      style: {
        transform: 'scale(1)',
        transformOrigin: 'top left',
      },
      skipAutoScale: true,
    })
    
    let unscheduledDataUrl: string | null = null
    if (unscheduledElement && unscheduledInfo) {
      unscheduledDataUrl = await toPng(unscheduledInfo.element, {
        quality: 1.0,
        backgroundColor: '#ffffff',
        pixelRatio: 3.0, // Reduced from 5.0 for better performance
        width: unscheduledInfo.actualWidth,
        height: unscheduledInfo.actualHeight,
        style: {
          transform: 'scale(1)',
          transformOrigin: 'top left',
        },
        skipAutoScale: true,
      })
    }
    
    // Restore elements immediately after capture
    restoreAllElements()
    console.log('🔄 Elements restored to original state')
    
    console.log(`📏 Calendar: ${calendarInfo.actualWidth}x${calendarInfo.actualHeight}`)
    if (unscheduledInfo) {
      console.log(`📏 Unscheduled: ${unscheduledInfo.actualWidth}x${unscheduledInfo.actualHeight}`)
    }
    
    // Step 3: Calculate final layout dimensions  
    const padding = 50
    const headerHeight = 40
    const sectionSpacing = 10 // Space between calendar and unscheduled section
    const footerSpacing = -30 // Smaller spacing between unscheduled and footer
    const bottomMargin = 60 // More space below footer to prevent text clipping
    
    // Calculate total content dimensions
    const maxWidth = Math.max(
      calendarInfo.actualWidth, 
      unscheduledInfo ? unscheduledInfo.actualWidth : 0
    )
    const totalContentHeight = calendarInfo.actualHeight + 
      (unscheduledInfo ? unscheduledInfo.actualHeight + sectionSpacing : 0)
    
    const finalWidth = Math.max(maxWidth + (padding * 2), 1000)
    const finalHeight = totalContentHeight + headerHeight + footerSpacing + bottomMargin + padding // Top padding + header + content + footer spacing + bottom margin
    
    const canvas = document.createElement('canvas')
    const scale = 2 // High DPI scaling for crisp text
    canvas.width = finalWidth * scale
    canvas.height = finalHeight * scale
    const ctx = canvas.getContext('2d')
    
    if (!ctx) throw new Error('Failed to get canvas context')
    
    // Scale the context for high-DPI rendering
    ctx.scale(scale, scale)
    
    // White background
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, finalWidth, finalHeight)
    
    // Header with your app's Geist font (exactly matching Next.js)
    ctx.fillStyle = '#111827'
    ctx.font = 'bold 30px Geist, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(termName, finalWidth / 2, padding + 10)
    
    console.log(`📏 Final dimensions: ${finalWidth}x${finalHeight}`)
    
    // Load and composite images
    const calendarImage = new Image()
    const unscheduledImage = unscheduledDataUrl ? new Image() : null
    
    return new Promise<void>((resolve, reject) => {
      let imagesLoaded = 0
      const totalImages = unscheduledImage ? 2 : 1
      
      const checkImagesLoaded = () => {
        imagesLoaded++
        if (imagesLoaded === totalImages) {
          try {
            // Draw calendar centered
            const calendarX = (finalWidth - calendarInfo.actualWidth) / 2
            const calendarY = padding + headerHeight
            ctx.drawImage(calendarImage, calendarX, calendarY, calendarInfo.actualWidth, calendarInfo.actualHeight)
            
            // Draw unscheduled section below calendar (if exists)
            if (unscheduledImage && unscheduledInfo) {
              const unscheduledX = (finalWidth - unscheduledInfo.actualWidth) / 2
              const unscheduledY = calendarY + calendarInfo.actualHeight + sectionSpacing
              ctx.drawImage(unscheduledImage, unscheduledX, unscheduledY, unscheduledInfo.actualWidth, unscheduledInfo.actualHeight)
            }
            
            // Two-line footer with brand emphasis
            const footerStartY = totalContentHeight + headerHeight + padding + footerSpacing
            
            // Line 1: Mixed emphasis - light prefix + prominent app name
            const line1Y = footerStartY + 20
            const prefixText = 'Generated from '
            const appName = 'Another CUHK Course Planner'
            
            // Measure text for positioning
            ctx.font = '16px Geist, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif'
            const prefixWidth = ctx.measureText(prefixText).width
            ctx.font = '500 16px Geist, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif'
            const appNameWidth = ctx.measureText(appName).width
            const totalWidth = prefixWidth + appNameWidth
            const startX = (finalWidth - totalWidth) / 2
            
            // "Generated from" - lighter
            ctx.fillStyle = '#6b7280'
            ctx.font = '16px Geist, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif'
            ctx.textAlign = 'left'
            ctx.fillText(prefixText, startX, line1Y)
            
            // App name - prominent
            ctx.fillStyle = '#4b5563'
            ctx.font = '500 16px Geist, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif'
            ctx.fillText(appName, startX + prefixWidth, line1Y)
            
            // Line 2: URL (secondary) - lighter and smaller
            ctx.fillStyle = '#6b7280'  // Lighter gray
            ctx.font = '14px Geist, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif'
            ctx.textAlign = 'center'  // Reset to center for URL
            ctx.fillText(websiteUrl, finalWidth / 2, footerStartY + 40)
            
            // Download
            canvas.toBlob((blob) => {
              if (!blob) {
                reject(new Error('Failed to create image'))
                return
              }
              
              const url = URL.createObjectURL(blob)
              const link = document.createElement('a')
              link.href = url
              link.download = `${termName.replace(/\s+/g, '-')}-schedule-${new Date().toISOString().split('T')[0]}.png`
              
              document.body.appendChild(link)
              link.click()
              document.body.removeChild(link)
              URL.revokeObjectURL(url)
              
              console.log('✅ Calendar screenshot with unscheduled sections saved successfully!')
              resolve()
            }, 'image/png', 0.95)
          } catch (drawError) {
            console.error('❌ Drawing error:', drawError)
            reject(drawError)
          }
        }
      }
      
      // Load calendar image
      calendarImage.onload = checkImagesLoaded
      calendarImage.onerror = () => reject(new Error('Failed to load calendar image'))
      calendarImage.src = calendarDataUrl
      
      // Load unscheduled image if it exists
      if (unscheduledImage && unscheduledDataUrl) {
        unscheduledImage.onload = checkImagesLoaded
        unscheduledImage.onerror = () => reject(new Error('Failed to load unscheduled image'))
        unscheduledImage.src = unscheduledDataUrl
      }
    })
    
  } catch (error) {
    // Always restore elements on error
    restoreAllElements()
    console.error('❌ Screenshot failed:', error)
    throw error
  }
}