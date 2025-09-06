/**
 * Screenshot utilities for calendar and course components
 * Extracted from courseUtils.ts for better separation of concerns
 */

// Layout configuration - centralized spacing and dimensions
interface LayoutConfig {
  padding: number
  headerHeight: number
  sectionSpacing: number  // Between calendar and unscheduled
  footerSpacing: number   // Between content and footer (context-dependent)
  bottomMargin: number    // Below footer
  minWidth: number        // Minimum canvas width
}

// Typography configuration - centralized font definitions
const FONTS = {
  // Geist font stack matching Next.js application
  base: 'Geist, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
  header: 'bold 30px Geist, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
  footerPrefix: '16px Geist, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
  footerBrand: '500 16px Geist, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
  footerUrl: '14px Geist, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif'
} as const

// Layout calculation result
interface ScreenshotLayout {
  canvas: {
    width: number
    height: number
  }
  header: {
    x: number
    y: number
  }
  calendar: {
    x: number
    y: number
    width: number
    height: number
  }
  unscheduled?: {
    x: number
    y: number
    width: number
    height: number
  }
  footer: {
    line1Y: number
    line2Y: number
    textStartX: number
  }
}

/**
 * Calculate screenshot layout dimensions and positions
 * Centralizes all spacing and positioning logic
 * 
 * @param calendarDimensions - Calendar element dimensions
 * @param unscheduledDimensions - Optional unscheduled section dimensions
 * @returns Complete layout specification with all element positions
 * 
 * Layout Flow:
 * [Header]
 * [Calendar]
 * [Unscheduled] (optional)
 * [Footer - Line 1: Generated from Another CUHK Course Planner]
 * [Footer - Line 2: website URL]
 */
function calculateScreenshotLayout(
  calendarDimensions: { width: number; height: number },
  unscheduledDimensions?: { width: number; height: number }
): ScreenshotLayout {
  const config: LayoutConfig = {
    padding: 50,
    headerHeight: 40,
    sectionSpacing: 10,
    footerSpacing: unscheduledDimensions ? -30 : 10, // Tighter with unscheduled, normal without
    bottomMargin: 60,
    minWidth: 1000
  }

  // Calculate content dimensions
  const maxContentWidth = Math.max(
    calendarDimensions.width,
    unscheduledDimensions?.width || 0
  )
  
  const totalContentHeight = calendarDimensions.height + 
    (unscheduledDimensions ? unscheduledDimensions.height + config.sectionSpacing : 0)

  // Calculate final canvas size
  const canvasWidth = Math.max(maxContentWidth + (config.padding * 2), config.minWidth)
  const canvasHeight = totalContentHeight + config.headerHeight + config.footerSpacing + config.bottomMargin + config.padding

  // Calculate element positions
  const headerX = canvasWidth / 2
  const headerY = config.padding + 10

  const calendarX = (canvasWidth - calendarDimensions.width) / 2
  const calendarY = config.padding + config.headerHeight

  const unscheduledLayout = unscheduledDimensions ? {
    x: (canvasWidth - unscheduledDimensions.width) / 2,
    y: calendarY + calendarDimensions.height + config.sectionSpacing,
    width: unscheduledDimensions.width,
    height: unscheduledDimensions.height
  } : undefined

  // Footer positioning
  const footerStartY = totalContentHeight + config.headerHeight + config.padding + config.footerSpacing
  
  return {
    canvas: {
      width: canvasWidth,
      height: canvasHeight
    },
    header: {
      x: headerX,
      y: headerY
    },
    calendar: {
      x: calendarX,
      y: calendarY,
      width: calendarDimensions.width,
      height: calendarDimensions.height
    },
    unscheduled: unscheduledLayout,
    footer: {
      line1Y: footerStartY + 20,
      line2Y: footerStartY + 40,
      textStartX: canvasWidth / 2 // Will be adjusted during text rendering
    }
  }
}

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
        // Normal style restoration (no more click-based expansion/restoration)
        console.log(`🔄 Restoring element with original style: "${state.originalStyle}"`)
        state.element.style.cssText = state.originalStyle
        
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
        
        // Check if content is currently expanded before we do anything
        let wasExpandedBefore = false
        const expandableContent = element.querySelector('[class*="px-3"][class*="pb-3"]') as HTMLElement
        if (expandableContent) {
          wasExpandedBefore = getComputedStyle(expandableContent).display !== 'none' && 
                            expandableContent.style.display !== 'none'
        }
        
        // EXPERIMENTAL: Don't hide preview cards, let CSS expansion handle the display logic
        console.log('🔍 EXPERIMENTAL: Not hiding preview cards, relying on CSS expansion to show proper content')
        
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
        
        // Force expand the main content - comprehensive approach (variables already declared above)
        
        // If not expanded, use CSS-only expansion for screenshot (don't change React state)
        if (!wasExpandedBefore && expandableContent) {
          console.log('📸 Using CSS-only expansion to avoid React state changes')
          // Force expansion using pure CSS - no clicks to avoid React state changes
          expandableContent.style.display = 'block'
          expandableContent.style.height = 'auto'
          expandableContent.style.overflow = 'visible'
          expandableContent.style.maxHeight = 'none'
          expandableContent.style.opacity = '1'
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
    
    // Step 3: Calculate layout using centralized system
    const layout = calculateScreenshotLayout(
      { width: calendarInfo.actualWidth, height: calendarInfo.actualHeight },
      unscheduledInfo ? { width: unscheduledInfo.actualWidth, height: unscheduledInfo.actualHeight } : undefined
    )
    
    const canvas = document.createElement('canvas')
    const scale = 2 // High DPI scaling for crisp text
    canvas.width = layout.canvas.width * scale
    canvas.height = layout.canvas.height * scale
    const ctx = canvas.getContext('2d')
    
    if (!ctx) throw new Error('Failed to get canvas context')
    
    // Scale the context for high-DPI rendering
    ctx.scale(scale, scale)
    
    // White background
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, layout.canvas.width, layout.canvas.height)
    
    // Header with consistent typography
    ctx.fillStyle = '#111827'
    ctx.font = FONTS.header
    ctx.textAlign = 'center'
    ctx.fillText(termName, layout.header.x, layout.header.y)
    
    console.log(`📏 Final dimensions: ${layout.canvas.width}x${layout.canvas.height}`)
    
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
            // Draw calendar using layout position
            ctx.drawImage(calendarImage, layout.calendar.x, layout.calendar.y, layout.calendar.width, layout.calendar.height)
            
            // Draw unscheduled section using layout position (if exists)
            if (unscheduledImage && layout.unscheduled) {
              ctx.drawImage(unscheduledImage, layout.unscheduled.x, layout.unscheduled.y, layout.unscheduled.width, layout.unscheduled.height)
            }
            
            // Two-line footer with brand emphasis using layout system
            const prefixText = 'Generated from '
            const appName = 'Another CUHK Course Planner'
            
            // Measure text for positioning using consistent fonts
            ctx.font = FONTS.footerPrefix
            const prefixWidth = ctx.measureText(prefixText).width
            ctx.font = FONTS.footerBrand
            const appNameWidth = ctx.measureText(appName).width
            const totalWidth = prefixWidth + appNameWidth
            const startX = (layout.canvas.width - totalWidth) / 2
            
            // Line 1: "Generated from" - lighter
            ctx.fillStyle = '#6b7280'
            ctx.font = FONTS.footerPrefix
            ctx.textAlign = 'left'
            ctx.fillText(prefixText, startX, layout.footer.line1Y)
            
            // Line 1: App name - prominent
            ctx.fillStyle = '#4b5563'
            ctx.font = FONTS.footerBrand
            ctx.fillText(appName, startX + prefixWidth, layout.footer.line1Y)
            
            // Line 2: URL (secondary) - lighter and smaller
            ctx.fillStyle = '#6b7280'
            ctx.font = FONTS.footerUrl
            ctx.textAlign = 'center'
            ctx.fillText(websiteUrl, layout.canvas.width / 2, layout.footer.line2Y)
            
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