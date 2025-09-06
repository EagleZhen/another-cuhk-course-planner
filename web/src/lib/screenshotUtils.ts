/**
 * Screenshot utilities for calendar and course components
 * Extracted from courseUtils.ts for better separation of concerns
 */

// Centralized screenshot configuration
const SCREENSHOT_CONFIG = {
  // DOM element selectors
  selectors: {
    cardContainer: '.border.border-gray-200.rounded-lg.shadow-sm',
    chevronIcon: 'svg.w-4.h-4.text-gray-400',
    expandableContent: '[class*="px-3"][class*="pb-3"]',
    courseCards: '.flex.flex-wrap.gap-2 > div',
    selectedCards: '[class*="scale-105"], [class*="shadow-lg"]'
  },
  
  // Layout configurations
  layout: {
    default: {
      padding: 50,
      headerHeight: 40,
      sectionSpacing: 10,
      footerSpacing: 10,
      bottomMargin: 60,
      minWidth: 1000
    },
    withUnscheduled: {
      padding: 50,
      headerHeight: 40,
      sectionSpacing: 10,
      footerSpacing: -30, // Tighter spacing when unscheduled section exists
      bottomMargin: 60,
      minWidth: 1000
    }
  },
  
  // Canvas rendering settings
  canvas: {
    scale: 2,           // High DPI scaling for crisp text
    backgroundColor: '#ffffff',
    imageFormat: 'image/png' as const,
    quality: 0.95,
    pixelRatio: 3.0     // For html-to-image capture
  },
  
  // Element styling during preparation
  styling: {
    unscheduledContainer: {
      paddingRight: '32px',
      paddingBottom: '24px',
      marginLeft: '30px',   // Align with calendar time column
      marginRight: '16px',
      marginBottom: '16px'
    },
    courseCard: {
      maxWidth: '160px',
      minWidth: '140px'
    },
    minElementWidth: 800
  },
  
  // CSS class replacements for clean screenshots
  classReplacements: {
    'scale-105': 'scale-100',
    'shadow-lg': 'shadow-sm'
  }
} as const

// Layout configuration interface
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
 * Get appropriate layout configuration based on content type
 */
function getLayoutConfig(hasUnscheduled: boolean): LayoutConfig {
  return hasUnscheduled 
    ? SCREENSHOT_CONFIG.layout.withUnscheduled 
    : SCREENSHOT_CONFIG.layout.default
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
  const config = getLayoutConfig(!!unscheduledDimensions)

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

// State management for element restoration during screenshot process
interface ElementState {
  element: HTMLElement
  originalStyle: string
  originalContent?: { element: HTMLElement; originalText: string }[]
  originalClasses?: { element: HTMLElement; originalClass: string }[]
}

/**
 * Manages element state restoration during screenshot capture
 * Centralizes all cleanup logic to ensure UI consistency
 */
class ScreenshotStateManager {
  private originalStates: ElementState[] = []

  /**
   * Store current element state for later restoration
   */
  storeElementState(
    element: HTMLElement, 
    originalStyle: string,
    originalContent: Array<{ element: HTMLElement; originalText: string }> = [],
    originalClasses: Array<{ element: HTMLElement; originalClass: string }> = []
  ): void {
    this.originalStates.push({
      element,
      originalStyle,
      originalContent,
      originalClasses
    })
  }

  /**
   * Restore all elements to their original state
   * Critical for maintaining UI consistency after screenshot
   */
  restoreAllElements(): void {
    try {
      this.originalStates.forEach(state => {
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

  /**
   * Clear stored states (for memory management)
   */
  clear(): void {
    this.originalStates = []
  }
}

/**
 * Prepare calendar element for screenshot capture
 * Handles basic visibility and sizing requirements
 */
function prepareCalendarElement(element: HTMLElement, stateManager: ScreenshotStateManager): void {
  const originalStyle = element.style.cssText
  stateManager.storeElementState(element, originalStyle)
  
  // Expand element for capture
  element.style.maxHeight = 'none'
  element.style.height = 'auto'
  element.style.overflow = 'visible'
  element.style.overflowY = 'visible'
}

/**
 * Type-safe element query functions
 */
function findCardContainer(element: HTMLElement): HTMLElement | null {
  return element.querySelector(SCREENSHOT_CONFIG.selectors.cardContainer)
}

function findChevronIcon(element: HTMLElement): HTMLElement | null {
  return element.querySelector(SCREENSHOT_CONFIG.selectors.chevronIcon)
}

function findExpandableContent(element: HTMLElement): HTMLElement | null {
  return element.querySelector(SCREENSHOT_CONFIG.selectors.expandableContent)
}

function findCourseCards(element: HTMLElement): NodeListOf<Element> {
  return element.querySelectorAll(SCREENSHOT_CONFIG.selectors.courseCards)
}

function findSelectedCards(element: HTMLElement): NodeListOf<Element> {
  return element.querySelectorAll(SCREENSHOT_CONFIG.selectors.selectedCards)
}

/**
 * Apply unscheduled container styling using configuration
 */
function applyUnscheduledContainerStyling(container: HTMLElement, calendarWidth?: number): void {
  const styling = SCREENSHOT_CONFIG.styling.unscheduledContainer
  
  // Transform from card to distinct section with proper borders
  container.setAttribute('class', 'border border-gray-200 bg-white')
  
  // Apply configured margins
  container.style.marginLeft = styling.marginLeft
  container.style.marginRight = styling.marginRight
  container.style.marginBottom = styling.marginBottom
  container.style.boxSizing = 'border-box'
  
  // Set width based on calendar width if provided
  if (calendarWidth) {
    const marginLeft = parseInt(styling.marginLeft)
    const marginRight = parseInt(styling.marginRight)
    const availableWidth = calendarWidth - marginLeft - marginRight
    container.style.width = `${availableWidth}px`
    console.log(`📏 Set unscheduled container width: ${availableWidth}px during element preparation`)
  }
}

/**
 * Apply course card styling using configuration
 */
function applyCourseCardStyling(cards: NodeListOf<Element>, stateManager: ScreenshotStateManager): void {
  const styling = SCREENSHOT_CONFIG.styling.courseCard
  
  cards.forEach(card => {
    const cardElement = card as HTMLElement
    const originalStyle = cardElement.style.cssText
    stateManager.storeElementState(cardElement, originalStyle)
    
    cardElement.style.maxWidth = styling.maxWidth
    cardElement.style.minWidth = styling.minWidth
  })
}

/**
 * Prepare unscheduled section element for screenshot capture
 * Handles complex styling, expansion, and visual cleanup
 */
function prepareUnscheduledElement(
  element: HTMLElement, 
  stateManager: ScreenshotStateManager, 
  calendarWidth?: number
): void {
  const originalStyle = element.style.cssText
  stateManager.storeElementState(element, originalStyle)
  
  const containerStyling = SCREENSHOT_CONFIG.styling.unscheduledContainer
  
  // Container sizing and overflow
  element.style.paddingRight = containerStyling.paddingRight
  element.style.paddingBottom = containerStyling.paddingBottom
  element.style.width = 'auto'
  element.style.minWidth = '100%'
  element.style.overflow = 'visible'
  element.style.boxSizing = 'content-box'
  element.style.maxHeight = 'none'
  element.style.height = 'auto'
  element.style.overflowY = 'visible'
  
  // Configure card container styling
  const cardContainer = findCardContainer(element)
  if (cardContainer) {
    const originalClass = cardContainer.getAttribute('class') || ''
    const originalStyle = cardContainer.style.cssText
    stateManager.storeElementState(cardContainer, originalStyle, [], [{ element: cardContainer, originalClass }])
    
    applyUnscheduledContainerStyling(cardContainer, calendarWidth)
  }
  
  // Hide interactive elements for professional look
  const chevron = findChevronIcon(element)
  if (chevron) {
    const originalClass = chevron.getAttribute('class') || ''
    stateManager.storeElementState(chevron, chevron.style.cssText, [], [{ element: chevron, originalClass }])
    chevron.setAttribute('class', originalClass + ' hidden')
  } else {
    console.log('⚠️ ChevronDown icon not found with configured selector')
  }
  
  // Handle content expansion
  const expandableContent = findExpandableContent(element)
  if (expandableContent) {
    const wasExpandedBefore = getComputedStyle(expandableContent).display !== 'none' && 
                              expandableContent.style.display !== 'none'
    
    console.log('🔍 EXPERIMENTAL: Not hiding preview cards, relying on CSS expansion to show proper content')
    
    // If not expanded, use CSS-only expansion for screenshot (don't change React state)
    if (!wasExpandedBefore) {
      console.log('📸 Using CSS-only expansion to avoid React state changes')
      const originalStyle = expandableContent.style.cssText
      stateManager.storeElementState(expandableContent, originalStyle)
      
      // Force expansion using pure CSS - no clicks to avoid React state changes
      expandableContent.style.display = 'block'
      expandableContent.style.height = 'auto'
      expandableContent.style.overflow = 'visible'
      expandableContent.style.maxHeight = 'none'
      expandableContent.style.opacity = '1'
    }
  }
  
  // Adjust course card widths for better screenshot proportions
  const courseCards = findCourseCards(element)
  applyCourseCardStyling(courseCards, stateManager)
}

/**
 * Apply CSS class replacements using configuration
 */
function applyClassReplacements(className: string): string {
  let cleanClass = className
  Object.entries(SCREENSHOT_CONFIG.classReplacements).forEach(([search, replace]) => {
    const regex = new RegExp(search, 'g')
    cleanClass = cleanClass.replace(regex, replace)
  })
  return cleanClass
}

/**
 * Clear visual selection effects from unscheduled section for clean screenshot
 * Uses CSS-only approach to avoid React state changes
 */
function clearSelectionEffects(element: HTMLElement, stateManager: ScreenshotStateManager): void {
  console.log('🧹 Clearing selection visual effects for clean screenshot...')
  const selectedCards = findSelectedCards(element)
  console.log(`Found ${selectedCards.length} cards with selection effects to clear`)
  
  selectedCards.forEach(card => {
    const cardElement = card as HTMLElement
    const originalClass = cardElement.getAttribute('class') || ''
    
    stateManager.storeElementState(cardElement, cardElement.style.cssText, [], [{ element: cardElement, originalClass }])
    
    // Remove selection visual effects using configured replacements
    const cleanClass = applyClassReplacements(originalClass)
    cardElement.setAttribute('class', cleanClass)
    
    // Also force remove transform via CSS
    cardElement.style.transform = 'scale(1)'
  })
}

/**
 * Capture element as PNG data URL using html-to-image with configuration
 */
async function captureElementAsPng(element: HTMLElement, width: number, height: number): Promise<string> {
  const { toPng } = await import('html-to-image')
  const canvasConfig = SCREENSHOT_CONFIG.canvas
  
  return await toPng(element, {
    quality: 1.0,
    backgroundColor: canvasConfig.backgroundColor,
    pixelRatio: canvasConfig.pixelRatio,
    width: width,
    height: height,
    style: {
      transform: 'scale(1)',
      transformOrigin: 'top left',
    },
    skipAutoScale: true,
  })
}

/**
 * Draw screenshot header with term name
 */
function drawScreenshotHeader(ctx: CanvasRenderingContext2D, termName: string, layout: ScreenshotLayout): void {
  ctx.fillStyle = '#111827'
  ctx.font = FONTS.header
  ctx.textAlign = 'center'
  ctx.fillText(termName, layout.header.x, layout.header.y)
}

/**
 * Draw screenshot footer with app branding and URL
 */
function drawScreenshotFooter(ctx: CanvasRenderingContext2D, websiteUrl: string, layout: ScreenshotLayout): void {
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
  
  // Line 2: URL (secondary) - lighter and smaller with underline
  ctx.fillStyle = '#6b7280'
  ctx.font = FONTS.footerUrl
  ctx.textAlign = 'center'
  const urlX = layout.canvas.width / 2
  ctx.fillText(websiteUrl, urlX, layout.footer.line2Y)
  
  // Add underline to make it look like a clickable link
  const urlWidth = ctx.measureText(websiteUrl).width
  const underlineY = layout.footer.line2Y + 2 // Slightly below text baseline
  ctx.beginPath()
  ctx.moveTo(urlX - urlWidth / 2, underlineY)
  ctx.lineTo(urlX + urlWidth / 2, underlineY)
  ctx.strokeStyle = '#6b7280'
  ctx.lineWidth = 1
  ctx.stroke()
}

/**
 * Create final composite image and trigger download using configuration
 */
function downloadCompositeImage(
  canvas: HTMLCanvasElement,
  termName: string
): Promise<void> {
  const canvasConfig = SCREENSHOT_CONFIG.canvas
  
  return new Promise((resolve, reject) => {
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
    }, canvasConfig.imageFormat, canvasConfig.quality)
  })
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
  const stateManager = new ScreenshotStateManager()

  try {
    console.log('📸 Starting calendar screenshot...')
    
    // Helper to prepare element for screenshot capture with measurements
    const prepareElementForCapture = async (element: HTMLElement, isUnscheduled = false, calendarWidth?: number) => {
      if (isUnscheduled) {
        prepareUnscheduledElement(element, stateManager, calendarWidth)
      } else {
        prepareCalendarElement(element, stateManager)
      }
      
      // Force layout recalculation
      void element.offsetHeight
      await new Promise(resolve => setTimeout(resolve, 50))
      
      const rect = element.getBoundingClientRect()
      return {
        element,
        actualWidth: Math.max(rect.width, SCREENSHOT_CONFIG.styling.minElementWidth),
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
      clearSelectionEffects(unscheduledElement, stateManager)
    }
    
    // Step 3: Capture images with proper error handling
    console.log('📷 Capturing images...')
    const calendarDataUrl = await captureElementAsPng(calendarInfo.element, calendarInfo.actualWidth, calendarInfo.actualHeight)
    
    let unscheduledDataUrl: string | null = null
    if (unscheduledElement && unscheduledInfo) {
      unscheduledDataUrl = await captureElementAsPng(unscheduledInfo.element, unscheduledInfo.actualWidth, unscheduledInfo.actualHeight)
    }
    
    // Restore elements immediately after capture
    stateManager.restoreAllElements()
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
    const canvasConfig = SCREENSHOT_CONFIG.canvas
    canvas.width = layout.canvas.width * canvasConfig.scale
    canvas.height = layout.canvas.height * canvasConfig.scale
    const ctx = canvas.getContext('2d')
    
    if (!ctx) throw new Error('Failed to get canvas context')
    
    // Scale the context for high-DPI rendering
    ctx.scale(canvasConfig.scale, canvasConfig.scale)
    
    // Background using configuration
    ctx.fillStyle = canvasConfig.backgroundColor
    ctx.fillRect(0, 0, layout.canvas.width, layout.canvas.height)
    
    // Header with consistent typography
    drawScreenshotHeader(ctx, termName, layout)
    
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
            drawScreenshotFooter(ctx, websiteUrl, layout)
            
            // Download composite image
            downloadCompositeImage(canvas, termName).then(resolve).catch(reject)
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
    stateManager.restoreAllElements()
    console.error('❌ Screenshot failed:', error)
    throw error
  } finally {
    // Clean up state manager
    stateManager.clear()
  }
}