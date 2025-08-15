'use client'

import { useState, useEffect, useMemo, startTransition } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronDown, ChevronUp, Plus, X, Info, Trash2, Search, ShoppingCart, AlertTriangle, MapPin } from 'lucide-react'
import { parseSectionTypes, isCourseEnrollmentComplete, getUniqueMeetings, getSectionPrefix, categorizeCompatibleSections, getSectionTypePriority, formatTimeCompact, formatInstructorCompact, removeInstructorTitle, getAvailabilityBadges, checkSectionConflict, googleSearchAndOpen, googleMapsSearchAndOpen, getDayIndex, type InternalCourse, type InternalSection, type CourseEnrollment, type SectionType } from '@/lib/courseUtils'
import { transformExternalCourseData } from '@/lib/validation'
import { analytics } from '@/lib/analytics'

// Using clean internal types only


interface CourseSearchProps {
  onAddCourse: (course: InternalCourse, termName: string, localSelections: Map<string, string>) => void
  onRemoveCourse: (courseKey: string) => void
  courseEnrollments: CourseEnrollment[]
  currentTerm: string
  availableTerms?: string[]
  onTermChange?: (term: string) => void
  selectedSections: Map<string, string>
  onSelectedSectionsChange: (sections: Map<string, string>) => void
  onSelectEnrollment?: (enrollmentId: string | null) => void
  onSearchControlReady?: (setSearchTerm: (term: string) => void) => void
  onDataUpdate?: (timestamp: Date, allCourses?: InternalCourse[]) => void // Callback when data is loaded
  selectedSubjects?: Set<string> // Subject filter
  onAvailableSubjectsUpdate?: (subjects: string[]) => void // Callback when subjects are discovered
}

export default function CourseSearch({ 
  onAddCourse,
  onRemoveCourse, 
  courseEnrollments,
  currentTerm,
  availableTerms = [],
  onTermChange,
  selectedSections,
  onSelectedSectionsChange,
  onSelectEnrollment,
  onSearchControlReady,
  onDataUpdate,
  selectedSubjects = new Set(),
  onAvailableSubjectsUpdate
}: CourseSearchProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set())
  
  // Day filter toggle function
  const toggleDayFilter = (dayIndex: number) => {
    setSelectedDays(prev => {
      const newSet = new Set(prev)
      if (newSet.has(dayIndex)) {
        newSet.delete(dayIndex)
      } else {
        newSet.add(dayIndex)
      }
      return newSet
    })
  }
  
  // Smooth debouncing for search performance
  useEffect(() => {
    // Immediate update for empty search (instant clear)
    if (searchTerm === '') {
      setDebouncedSearchTerm('')
      setIsSearching(false)
      return
    }
    
    // Show searching state when user is typing
    setIsSearching(true)
    
    // Short delay for single characters (responsive but not overwhelming)
    const delay = searchTerm.length === 1 ? 400 : 200
    
    const timer = setTimeout(() => {
      // Use startTransition to mark search updates as non-urgent
      // This prevents search processing from blocking user input
      startTransition(() => {
        setDebouncedSearchTerm(searchTerm)
        setIsSearching(false)
      })
    }, delay)
    
    return () => clearTimeout(timer)
  }, [searchTerm])
  
  // Expose search function to parent
  useEffect(() => {
    if (onSearchControlReady) {
      onSearchControlReady(setSearchTerm)
    }
  }, [onSearchControlReady])

  const [loading, setLoading] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState({ loaded: 0, total: 0, currentSubject: '' })
  const [performanceStats, setPerformanceStats] = useState<{
    totalLoadTime?: number
    subjectLoadTimes: { subject: string, time: number, size: number }[]
    totalDataSize: number
  }>({
    subjectLoadTimes: [],
    totalDataSize: 0
  })
  const [allCourses, setAllCourses] = useState<InternalCourse[]>([])
  const [availableSubjects, setAvailableSubjects] = useState<string[]>([])
  const [isTermDropdownOpen, setIsTermDropdownOpen] = useState(false)
  const [hasDataLoaded, setHasDataLoaded] = useState(false)
  const [shuffleTrigger, setShuffleTrigger] = useState(0) // Counter to trigger shuffle
  
  // Removed global state - CourseCard now manages its own state

  // Calculate subjects that actually have courses in current term
  const subjectsWithCourses = useMemo(() => {
    if (availableSubjects.length === 0 || allCourses.length === 0) {
      return []
    }
    
    const subjectsInTerm = new Set<string>()
    allCourses.forEach(course => {
      if (course.terms.some(term => term.termName === currentTerm)) {
        subjectsInTerm.add(course.subject)
      }
    })
    
    // Filter available subjects to only include those with courses in current term
    return availableSubjects.filter(subject => subjectsInTerm.has(subject))
  }, [availableSubjects, allCourses, currentTerm])

  // Notify parent when available subjects are discovered
  useEffect(() => {
    if (subjectsWithCourses.length > 0 && onAvailableSubjectsUpdate) {
      onAvailableSubjectsUpdate(subjectsWithCourses)
    }
  }, [subjectsWithCourses, onAvailableSubjectsUpdate])

  // Helper function to check if course is already enrolled
  const isCourseAdded = (course: InternalCourse) => {
    return courseEnrollments.some(enrollment => 
      enrollment.course.subject === course.subject && enrollment.course.courseCode === course.courseCode
    )
  }

  // Helper function to get enrolled course for comparison
  const getEnrolledCourse = (course: InternalCourse): CourseEnrollment | null => {
    return courseEnrollments.find(enrollment => 
      enrollment.course.subject === course.subject && enrollment.course.courseCode === course.courseCode
    ) || null
  }

  // Helper function to check if current selections differ from enrolled selections
  const hasSelectionsChanged = (course: InternalCourse): boolean => {
    const enrolled = getEnrolledCourse(course)
    if (!enrolled) return false
    
    // Convert global selections to local format for this course
    const courseKey = `${course.subject}${course.courseCode}`
    const currentLocalSelections = new Map<string, string>()
    for (const [key, sectionId] of selectedSections) {
      if (key.startsWith(courseKey + '_')) {
        const sectionType = key.substring(courseKey.length + 1)
        currentLocalSelections.set(sectionType, sectionId)
      }
    }
    
    // If no current selections, then no changes are pending (selections were cleared after adding)
    if (currentLocalSelections.size === 0) return false
    
    // If different number of selections, then changes exist
    if (currentLocalSelections.size !== enrolled.selectedSections.length) return true
    
    // Check if any selected sections differ from enrolled sections
    return enrolled.selectedSections.some(enrolledSection => 
      currentLocalSelections.get(enrolledSection.sectionType) !== enrolledSection.id
    )
  }

  // Load course data on component mount and when term changes
  useEffect(() => {
    // Skip loading if data is already loaded this session for this term
    if (hasDataLoaded) {
      console.log('📦 Course data already loaded this session, skipping reload')
      return
    }

    const loadCourseData = async () => {
      setLoading(true)
      
      // Performance tracking
      const startTime = performance.now()
      const subjectLoadTimes: { subject: string, time: number, size: number }[] = []
      let totalDataSize = 0
      
      try {
        // 🚀 MVP APPROACH: Load ALL subjects for complete coverage and simplicity
        // No term-specific filtering - let the data itself determine availability
        console.log(`📂 Loading ALL subjects for complete coverage...`)
        setLoadingProgress({ loaded: 0, total: 1, currentSubject: 'Preparing complete subject list...' })
        
        const ALL_SUBJECTS = [
          'ACCT', 'ACPY', 'AENP', 'AEPT', 'AIMS', 'AIST', 'ANAT', 'ANIC', 'ANTH', 'APEP', 
          'ARAB', 'ARCH', 'ARTS', 'ASEI', 'BAMS', 'BASA', 'BBMS', 'BCHE', 'BCHM', 'BCJC',
          'BCME', 'BECE', 'BEHM', 'BEST', 'BIOL', 'BIOS', 'BMBL', 'BMED', 'BMEG', 'BMJC',
          'BSCG', 'BUDS', 'CCNU', 'CCSS', 'CDAS', 'CENG', 'CGEN', 'CHCU', 'CHED', 'CHEM',
          'CHES', 'CHLL', 'CHLT', 'CHPR', 'CHPY', 'CLCC', 'CLCE', 'CLCH', 'CLCP', 'CLED',
          'CLGY', 'CMBI', 'CMSC', 'CNGT', 'CODS', 'COMM', 'COOP', 'CSCI', 'CULS', 'CUMT',
          'CURE', 'CVSM', 'DBAC', 'DIUS', 'DOTE', 'DROI', 'DSME', 'DSPS', 'EASC', 'ECLT',
          'ECON', 'ECTM', 'EDUC', 'EEEN', 'EESC', 'EIHP', 'ELED', 'ELEG', 'ELTU', 'EMBA',
          'EMBF', 'ENGE', 'ENGG', 'ENLC', 'ENLT', 'ENSC', 'EPBI', 'EPID', 'EPIN', 'EPSY',
          'ESGS', 'ESSC', 'ESTR', 'EXSC', 'FAAS', 'FAME', 'FINA', 'FNSC', 'FREN', 'FTEC',
          'GAST', 'GDRS', 'GECC', 'GECW', 'GEJC', 'GEMC', 'GENA', 'GEOR', 'GERM', 'GESC',
          'GESH', 'GEUC', 'GEWS', 'GEYS', 'GISM', 'GLBS', 'GLEF', 'GLOF', 'GLSD', 'GNBF',
          'GNED', 'GPAD', 'GPEC', 'GPGC', 'GPSU', 'GRMD', 'GRON', 'HIST', 'HKSL', 'HPSB',
          'HSGS', 'HSOC', 'HSYS', 'HTMG', 'IASP', 'IBBA', 'IEMS', 'IERG', 'IMSC', 'INDA',
          'INFD', 'ITAL', 'JASP', 'KORE', 'LAWS', 'LDTE', 'LING', 'LSCI', 'LSCM', 'LSED',
          'MAED', 'MAEG', 'MAPE', 'MASE', 'MATH', 'MAVE', 'MBAC', 'MBTE', 'MCLE', 'MCLS',
          'MCNS', 'MECM', 'MEDF', 'MEDM', 'MEDP', 'MEDU', 'MESC', 'MFMD', 'MGNT', 'MHLS',
          'MICY', 'MIEG', 'MITE', 'MKTG', 'MLSC', 'MMAT', 'MPTE', 'MPUP', 'MRGO', 'MSAE',
          'MSEG', 'MSMR', 'MTCI', 'MUSC', 'NSCI', 'NSSC', 'NURS', 'OBGY', 'OBSC', 'OENV',
          'OMBA', 'ORLC', 'ORTY', 'OVSC', 'PBHT', 'PEDU', 'PGDC', 'PGDE', 'PGDP', 'PHAR',
          'PHEC', 'PHED', 'PHIL', 'PHMA', 'PHPC', 'PHUG', 'PHYS', 'PHYY', 'POPG', 'POPN',
          'PRHC', 'PSYC', 'PUBH', 'REES', 'RELS', 'RMCE', 'RMED', 'RMSC', 'ROSE', 'RUSS',
          'SBMS', 'SEEM', 'SENV', 'SGCL', 'SILP', 'SLPA', 'SOCI', 'SOSC', 'SOWK', 'SPAN',
          'SPED', 'SPSY', 'SSMU', 'SSPA', 'SSPE', 'STAR', 'STAT', 'SURY', 'SUTM', 'TESL',
          'THAI', 'THEO', 'TRAN', 'UGCP', 'UGEA', 'UGEB', 'UGEC', 'UGED', 'UGFH', 'UGFN',
          'URBD', 'URSP', 'WOHS', 'XCBS', 'XCCS', 'XFUD', 'XUNC', 'XUSC', 'XWAS'
        ]
        
        console.log(`📂 Complete subject list: ${ALL_SUBJECTS.length} subjects (no term filtering)`)
        console.log(`🎯 Benefits: Complete coverage, simple logic, browser caching optimized`)
        
        // Store all subjects for parent component (they'll filter by current term)
        setAvailableSubjects(ALL_SUBJECTS)
        const availableSubjects: string[] = [...ALL_SUBJECTS]

        setLoadingProgress({ loaded: 0, total: availableSubjects.length, currentSubject: 'Starting parallel load...' })

        const allCoursesData: InternalCourse[] = []
        const scrapingTimestamps: Date[] = []
        let completedCount = 0

        console.log(`🚀 Loading ${availableSubjects.length} subjects in PARALLEL using Vercel CDN...`)
        
        // 🔥 PARALLEL LOADING: Fire ALL requests simultaneously!
        const allPromises = availableSubjects.map(async (subject) => {
          const subjectStartTime = performance.now()
          
          try {
            const response = await fetch(`/data/${subject}.json`)
            if (response.ok) {
              const rawData = await response.json()
              const subjectEndTime = performance.now()
              
              // Calculate approximate data size (rough estimate)
              const dataSize = JSON.stringify(rawData).length
              const loadTime = subjectEndTime - subjectStartTime
              
              // Update progress as each request completes (thread-safe)
              completedCount++
              setLoadingProgress(() => ({ 
                loaded: completedCount, 
                total: availableSubjects.length, 
                currentSubject: `${subject} (${Math.round(loadTime)}ms) - ${completedCount}/${availableSubjects.length}` 
              }))
              
              // Extract scraping timestamp from metadata
              let scrapedAt = null
              if (rawData.metadata?.scraped_at) {
                try {
                  scrapedAt = new Date(rawData.metadata.scraped_at)
                  console.log(`📅 ${subject} scraped at: ${scrapedAt.toLocaleString()}`)
                } catch {
                  console.warn(`Invalid scraped_at timestamp in ${subject}.json:`, rawData.metadata.scraped_at)
                }
              }
              
              // Validate data structure
              if (rawData.courses && Array.isArray(rawData.courses)) {
                const transformedData = transformExternalCourseData(rawData)
                console.log(`✅ ${subject}: ${transformedData.courses.length} courses, ${Math.round(dataSize / 1024)}KB, ${Math.round(loadTime)}ms`)
                
                return {
                  subject,
                  courses: transformedData.courses,
                  loadTime: Math.round(loadTime),
                  dataSize: Math.round(dataSize / 1024),
                  scrapedAt,
                  success: true
                }
              } else {
                console.warn(`Invalid data structure in ${subject}.json`)
                return { subject, success: false, error: 'Invalid data structure' }
              }
            } else {
              console.warn(`Failed to load ${subject}.json: ${response.status}`)
              return { subject, success: false, error: `HTTP ${response.status}` }
            }
          } catch (error) {
            console.warn(`Failed to load ${subject} data:`, error)
            return { subject, success: false, error: String(error) }
          }
        })
        
        // Wait for ALL requests to complete
        console.log(`⏳ Waiting for all ${availableSubjects.length} parallel requests to complete...`)
        const results = await Promise.all(allPromises)
        
        // Process successful results
        results.forEach(result => {
          if (result.success && result.courses) {
            allCoursesData.push(...result.courses)
            if (result.scrapedAt) {
              scrapingTimestamps.push(result.scrapedAt)
            }
            subjectLoadTimes.push({
              subject: result.subject,
              time: result.loadTime || 0,
              size: result.dataSize || 0
            })
          } else {
            subjectLoadTimes.push({
              subject: result.subject,
              time: 0,
              size: 0
            })
          }
        })
        
        const successCount = results.filter(r => r.success).length
        totalDataSize = subjectLoadTimes.reduce((sum, s) => sum + (s.size * 1024), 0)

        // Calculate total load time and log performance summary
        const totalLoadTime = performance.now() - startTime
        
        console.log(`🎉 PARALLEL LOADING COMPLETE!`)
        console.log(`📚 Loaded ${allCoursesData.length} total courses from ${successCount}/${availableSubjects.length} subjects`)
        console.log(`⚡ Parallel Performance Summary:`)
        console.log(`   🚀 Total parallel load time: ${Math.round(totalLoadTime)}ms (${(totalLoadTime/1000).toFixed(1)}s)`)
        console.log(`   📦 Total data size: ${Math.round(totalDataSize / 1024)}KB (${(totalDataSize / 1024 / 1024).toFixed(1)}MB)`)
        console.log(`   ⚡ Speedup: ALL subjects loaded simultaneously instead of sequentially!`)
        console.log(`   🏆 Previous sequential time would have been: ~${Math.round(subjectLoadTimes.reduce((sum, s) => sum + s.time, 0))}ms`)
        
        // Log fastest and slowest requests for insight
        const validTimes = subjectLoadTimes.filter(s => s.time > 0)
        if (validTimes.length > 0) {
          const fastest = validTimes.reduce((min, s) => s.time < min.time ? s : min)
          const slowest = validTimes.reduce((max, s) => s.time > max.time ? s : max)
          console.log(`   🏃 Fastest: ${fastest.subject} (${fastest.time}ms, ${fastest.size}KB)`)
          console.log(`   🐌 Slowest: ${slowest.subject} (${slowest.time}ms, ${slowest.size}KB)`)
          console.log(`   📊 Average per request: ${Math.round(validTimes.reduce((sum, s) => sum + s.time, 0) / validTimes.length)}ms`)
        }
        
        // Store performance stats for potential UI display
        setPerformanceStats({
          totalLoadTime: Math.round(totalLoadTime),
          subjectLoadTimes,
          totalDataSize: Math.round(totalDataSize / 1024) // KB
        })
        
        if (successCount === 0) {
          console.error('❌ No course data could be loaded - check that /data/ files exist')
        }
        
        setAllCourses(allCoursesData)
        setHasDataLoaded(true) // Mark data as loaded for this session
        setLoading(false)
        
        // Track loading performance
        const totalLoadTimeSeconds = Math.round(totalLoadTime / 1000)
        analytics.catalogLoaded(totalLoadTimeSeconds, successCount)
        analytics.loadingExperience(totalLoadTimeSeconds)
        
        // Find the oldest scraping timestamp and notify parent
        if (scrapingTimestamps.length > 0 && onDataUpdate) {
          const oldestTimestamp = new Date(Math.min(...scrapingTimestamps.map(d => d.getTime())))
          console.log(`🕒 Oldest data from: ${oldestTimestamp.toLocaleString()} (${scrapingTimestamps.length} files checked)`)
          onDataUpdate(oldestTimestamp, allCoursesData) // Pass both timestamp and fresh course data for sync
        }
        
      } catch (error) {
        console.error('Failed to load course data:', error)
        analytics.catalogFailed()
        analytics.userError('catalog_load_failed')
        setLoading(false)
      } finally {
        setLoadingProgress({ loaded: 0, total: 0, currentSubject: '' })
      }
    }

    loadCourseData()
  }, [onDataUpdate, currentTerm, hasDataLoaded]) // Re-run when term changes to get term-specific subjects

  // Real-time search with useMemo for performance, filtered by current term

  const searchResults = useMemo(() => {
    // First filter by term - only show courses available in current term
    let filteredCourses = allCourses.filter(course => 
      course.terms.some(term => term.termName === currentTerm)
    )
    
    // Apply subject filter if any subjects are selected
    if (selectedSubjects.size > 0) {
      filteredCourses = filteredCourses.filter(course => 
        selectedSubjects.has(course.subject)
      )
    }
    
    // Apply day filter if any days are selected
    if (selectedDays.size > 0) {
      filteredCourses = filteredCourses.filter(course => {
        const currentTermData = course.terms.find(term => term.termName === currentTerm)
        if (!currentTermData) return false
        
        // Check if course has any sections on selected days
        return currentTermData.sections.some(section => 
          section.meetings.some(meeting => {
            const dayIndex = getDayIndex(meeting.time)
            return dayIndex !== null && selectedDays.has(dayIndex)
          })
        )
      })
    }
    
    // Determine if user has applied any filters or search
    const hasFiltersOrSearch = debouncedSearchTerm.trim() || selectedSubjects.size > 0 || selectedDays.size > 0
    
    // Apply search term filter if provided
    let finalCourses = filteredCourses
    if (debouncedSearchTerm.trim()) {
      const searchLower = debouncedSearchTerm.toLowerCase()
      finalCourses = filteredCourses.filter(course => {
        // Create full course code without space for searching
        const fullCourseCode = `${course.subject}${course.courseCode}`.toLowerCase()
        
        return (
          fullCourseCode.includes(searchLower) ||
          course.courseCode.toLowerCase().includes(searchLower) ||
          course.title.toLowerCase().includes(searchLower) ||
          course.terms.some(term =>
            term.sections.some(section =>
              section.meetings.some(meeting =>
                meeting.instructor.toLowerCase().includes(searchLower)
              )
            )
          )
        )
      })
    }

    // Apply shuffle if triggered (one-off action based on shuffleTrigger counter)
    if (shuffleTrigger > 0) {
      // Create a copy and shuffle using Fisher-Yates algorithm
      finalCourses = [...finalCourses]
      for (let i = finalCourses.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [finalCourses[i], finalCourses[j]] = [finalCourses[j], finalCourses[i]]
      }
    }

    // Simple limiting logic based on user intent
    const limit = hasFiltersOrSearch ? 100 : 10

    return {
      courses: finalCourses.slice(0, limit),
      total: finalCourses.length,
      isLimited: finalCourses.length > limit,
      isShuffled: shuffleTrigger > 0
    }
  }, [debouncedSearchTerm, allCourses, currentTerm, selectedSubjects, selectedDays, shuffleTrigger])

  // Track search analytics - simplified for MVP
  useEffect(() => {
    if (debouncedSearchTerm.trim() && debouncedSearchTerm.length > 2) {
      const foundResults = searchResults.total > 0
      analytics.searchUsed(foundResults)
    }
  }, [debouncedSearchTerm, searchResults.total])

  // No complex filter tracking - keep it simple for MVP

  return (
    <div className="space-y-4">
      {/* Sticky Search Input with Term Filter Hint */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 pb-4 -mx-4 px-4 pt-4">
        <div className="w-full space-y-2">
          <div className="relative">
            <Input
              type="text"
              placeholder="Search courses (e.g., UGFH1000, In Dialogue with Nature, YU Bei)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full transition-all duration-200 ${isSearching ? 'pr-8' : ''}`}
            />
            {isSearching && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <Info className="w-3 h-3" />
            <span>Showing courses available in</span>
            {availableTerms.length > 0 && onTermChange ? (
              <div className="relative">
                <button
                  onClick={() => setIsTermDropdownOpen(!isTermDropdownOpen)}
                  className={`inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer ${isTermDropdownOpen ? 'relative z-50' : ''}`}
                  title="Click to change term"
                >
                  <span>{currentTerm}</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
                
                {isTermDropdownOpen && (
                  <>
                    {/* Backdrop */}
                    <div 
                      className="fixed inset-0 z-40 cursor-pointer" 
                      onClick={() => setIsTermDropdownOpen(false)}
                    />
                    
                    {/* Dropdown */}
                    <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-md shadow-lg min-w-[250px]">
                      <div className="py-1">
                        {availableTerms.map(term => (
                          <button
                            key={term}
                            type="button"
                            className={`block w-full text-left px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer ${
                              term === currentTerm ? 'bg-blue-50 text-blue-600' : 'text-gray-900'
                            }`}
                            onClick={() => {
                              onTermChange?.(term)
                              setIsTermDropdownOpen(false)
                            }}
                          >
                            {term}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <strong>{currentTerm}</strong>
            )}
            {selectedSubjects.size > 0 && (
              <>
                <span>filtered by</span>
                <span className="font-semibold text-blue-600">
                  {Array.from(selectedSubjects).sort().join(', ')}
                </span>
                <span>({selectedSubjects.size} subject{selectedSubjects.size !== 1 ? 's' : ''})</span>
              </>
            )}
          </div>
          
          {/* Course-level Day Filters */}
          <div className="flex items-center gap-2 flex-wrap mt-2 pt-2 border-t border-gray-100">
            <span className="text-sm font-medium text-gray-700">Filter by Days:</span>
            
            {/* Day filter buttons */}
            {(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const).map((dayName, dayIndex) => {
              const isSelected = selectedDays.has(dayIndex)
              const shortName = dayName.slice(0, 3) // Mon, Tue, Wed, Thu, Fri
              
              return (
                <Button
                  key={dayName}
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleDayFilter(dayIndex)}
                  className="h-6 px-2 text-xs font-normal border-1 cursor-pointer"
                  title={isSelected ? `Remove ${dayName} filter` : `Show only courses with classes on ${dayName}`}
                >
                  {shortName}
                </Button>
              )
            })}
            
            {/* Clear day filters button */}
            {selectedDays.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setSelectedDays(new Set())
                }}
                className="h-6 px-2 text-xs font-medium cursor-pointer"
                title="Clear all day filters"
              >
                Clear Days
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Search Results with Natural Flow */}
      <div className="space-y-3 pb-8">
        {loading ? (
          <div className="text-center py-12 px-4">
            <div className="max-w-2xl mx-auto space-y-6">
              {/* Main Loading Animation */}
              <div className="flex items-center justify-center">
                <div className="relative">
                  {/* Modern spinner */}
                  <div className="w-12 h-12 border-2 border-gray-200 border-t-blue-600 rounded-full animate-spin"></div>
                </div>
              </div>

              {/* Professional Context */}
              <div className="space-y-3">
                <h3 className="text-xl font-semibold text-gray-900">
                  Loading Comprehensive Course Catalog
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
                    <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                    <span>Loading time depends on your network connection</span>
                  </div>
                </div>
              </div>

              {/* Modern Progress Display */}
              {loadingProgress.total > 0 && (
                <div className="space-y-4">
                  {/* Current Status */}
                  <div className="text-sm font-medium text-gray-700">
                    {loadingProgress.currentSubject ? (
                      <div className="flex items-center justify-center gap-3">
                        <div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin"></div>
                        <span>Loading {loadingProgress.currentSubject.split(' ')[0]} courses</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-3">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
                          <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" style={{animationDelay: '0.1s'}}></div>
                          <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
                        </div>
                        <span>Initializing course catalog...</span>
                      </div>
                    )}
                  </div>

                  {/* Progress Card */}
                  <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
                    <div className="flex items-center justify-between text-sm mb-3">
                      <span className="text-gray-600 font-medium">Loading Progress</span>
                      <span className="font-mono text-sm text-gray-900">
                        {loadingProgress.loaded} / {loadingProgress.total}
                        <span className="ml-2 text-xs text-gray-500 font-sans">
                          ({Math.round((loadingProgress.loaded / loadingProgress.total) * 100)}%)
                        </span>
                      </span>
                    </div>

                    {/* Modern Progress Bar */}
                    <div className="relative">
                      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div 
                          className="h-2 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500 ease-out"
                          style={{ 
                            width: `${loadingProgress.total > 0 ? (loadingProgress.loaded / loadingProgress.total) * 100 : 0}%` 
                          }}
                        ></div>
                      </div>
                    </div>

                    {/* Performance Metrics with Time Estimation */}
                    {performanceStats.subjectLoadTimes.length > 3 && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="grid grid-cols-3 gap-4 text-xs">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                            <span className="text-gray-600">Avg Speed:</span>
                            <span className="font-mono text-gray-900">
                              {Math.round(
                                performanceStats.subjectLoadTimes
                                  .filter(s => s.time > 0)
                                  .reduce((sum, s) => sum + s.time, 0) / 
                                performanceStats.subjectLoadTimes.filter(s => s.time > 0).length
                              )}ms
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                            <span className="text-gray-600">Data Size:</span>
                            <span className="font-mono text-gray-900">
                              {Math.round(performanceStats.totalDataSize / 1024)}KB
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                            <span className="text-gray-600">Est. Time:</span>
                            <span className="font-mono text-gray-900">
                              {(() => {
                                const completedRequests = performanceStats.subjectLoadTimes.filter(s => s.time > 0)
                                if (completedRequests.length < 3) return 'Calculating...'
                                
                                const avgTime = completedRequests.reduce((sum, s) => sum + s.time, 0) / completedRequests.length
                                const remaining = loadingProgress.total - loadingProgress.loaded
                                const estimatedMs = remaining * avgTime
                                
                                if (estimatedMs < 1000) return '<1s'
                                if (estimatedMs < 60000) return `${Math.round(estimatedMs / 1000)}s`
                                return `${Math.round(estimatedMs / 60000)}m`
                              })()}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Status Message */}
                  <div className="text-center">
                    <div className="text-sm text-gray-600">
                      {loadingProgress.loaded < loadingProgress.total * 0.3 ? (
                        "Initializing course data loading..."
                      ) : loadingProgress.loaded < loadingProgress.total * 0.7 ? (
                        "Processing course information..."
                      ) : (
                        "Finalizing course catalog..."
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Professional Tips Panel */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-5">
                <h4 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-blue-100 flex items-center justify-center">
                    <Info className="w-2.5 h-2.5 text-blue-600" />
                  </div>
                  <span>Search Tips</span>
                </h4>
                <div className="text-sm text-slate-700 space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full mt-2 flex-shrink-0"></div>
                    <span>Course data is cached locally for improved performance on subsequent searches</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full mt-2 flex-shrink-0"></div>
                    <span>Use subject filters to focus on specific areas of study</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full mt-2 flex-shrink-0"></div>
                    <span>Search by course code, course title, or instructor name for precise results</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : searchResults.courses.length === 0 ? (
          <div className="text-center py-12">
            {searchTerm || selectedSubjects.size > 0 ? (
              // No results for search/filter
              <div className="space-y-3">
                <div className="text-gray-400">
                  <Search className="w-12 h-12 mx-auto mb-3" />
                </div>
                <h3 className="text-lg font-semibold text-gray-600">No courses found</h3>
                <p className="text-sm text-gray-500 mx-auto truncate">
                  {searchTerm && selectedSubjects.size > 0 
                    ? `No courses match "${searchTerm}" in the selected ${selectedSubjects.size} subject${selectedSubjects.size !== 1 ? 's' : ''}.`
                    : searchTerm 
                    ? `No courses match "${searchTerm}". Try different keywords or check spelling.`
                    : `No courses found in the ${selectedSubjects.size} selected subject${selectedSubjects.size !== 1 ? 's' : ''}.`
                  }
                </p>
                <div className="space-y-2 text-xs text-gray-400">
                  <p>💡 Try:</p>
                  <div className="space-y-1">
                    {searchTerm && <p>• Clearing the search term</p>}
                    {selectedSubjects.size > 0 && <p>• Changing or removing subject filters</p>}
                    <p>• Searching for course codes like &ldquo;CSCI3100&rdquo;</p>
                    <p>• Searching for course titles like &ldquo;In Dialogue with Nature&rdquo;</p>
                    <p>• Searching for instructor names</p>
                  </div>
                </div>
              </div>
            ) : (
              // No data available
              <div className="space-y-3">
                <div className="text-gray-400">
                  <span className="text-4xl">📚</span>
                </div>
                <h3 className="text-lg font-semibold text-gray-600">No courses available</h3>
                <p className="text-sm text-gray-500">
                  No course data is currently available for {currentTerm}.
                </p>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm text-gray-600">
                Showing {searchResults.courses.length} course{searchResults.courses.length !== 1 ? 's' : ''}
                {searchResults.total > searchResults.courses.length && (
                  <span className="font-medium"> of {searchResults.total} total</span>
                )}
                {searchTerm && ` matching "${searchTerm}"`}
                {searchResults.isShuffled && (
                  <>
                    <span className="text-blue-600 font-medium"> (shuffled)</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShuffleTrigger(0)}
                      className="h-6 px-2 text-xs cursor-pointer ml-2"
                      title="Reset to original order"
                    >
                      ↻ Reset
                    </Button>
                  </>
                )}
              </div>
              
              {searchResults.total > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShuffleTrigger(prev => prev + 1)}
                  className="h-6 px-2 text-xs cursor-pointer"
                  title="Shuffle courses for discovery"
                >
                  🎲 Shuffle
                </Button>
              )}
            </div>
            
            {/* Show helpful message when results are limited */}
            {searchResults.isLimited && (
              <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
                <div className="flex items-start gap-2">
                  <span className="text-amber-600 text-3xl">💡</span>
                  <div>
                    <strong>Too many results to display.</strong>
                    <br />
                    <span className="text-amber-600">Try searching for specific course codes or adding more subject filters to narrow results.</span>
                  </div>
                </div>
              </div>
            )}
            
            <div className="space-y-3">
              {searchResults.courses.map((course, index) => (
                <CourseCard
                  key={`${course.subject}-${course.courseCode}-${index}`} 
                  course={course}
                  currentTerm={currentTerm}
                  initialSelections={(() => {
                    const courseKey = `${course.subject}${course.courseCode}`
                    const courseSelections = new Map<string, string>()
                    for (const [key, sectionId] of selectedSections) {
                      if (key.startsWith(courseKey + '_')) {
                        const sectionType = key.substring(courseKey.length + 1)
                        courseSelections.set(sectionType, sectionId)
                      }
                    }
                    return courseSelections
                  })()}
                  onSectionsChange={(course, newSelections) => {
                    // Convert back to global format and update
                    const courseKey = `${course.subject}${course.courseCode}`
                    const newMap = new Map(selectedSections)
                    
                    // Remove old selections for this course
                    for (const key of newMap.keys()) {
                      if (key.startsWith(courseKey + '_')) {
                        newMap.delete(key)
                      }
                    }
                    
                    // Add new selections
                    for (const [sectionType, sectionId] of newSelections) {
                      newMap.set(`${courseKey}_${sectionType}`, sectionId)
                    }
                    
                    onSelectedSectionsChange(newMap)
                  }}
                  onAddCourse={(course, localSelections) => onAddCourse(course, currentTerm, localSelections)}
                  onRemoveCourse={onRemoveCourse}
                  isAdded={isCourseAdded(course)}
                  hasSelectionsChanged={hasSelectionsChanged(course)}
                  onSelectEnrollment={onSelectEnrollment}
                  courseEnrollments={courseEnrollments}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// Reusable instructor filters component
function InstructorFilters({
  instructors,
  selectedInstructors,
  onToggleInstructor,
  onClearAll,
  isMobile = false
}: {
  instructors: string[]
  selectedInstructors: Set<string>
  onToggleInstructor: (instructor: string) => void
  onClearAll: () => void
  isMobile?: boolean
}) {
  return (
    <div className={`flex gap-2 ${isMobile ? 'flex-col w-full' : 'flex-wrap'}`}>
      {instructors.map(instructor => {
        const formattedInstructor = formatInstructorCompact(instructor)
        const isSelected = selectedInstructors.has(formattedInstructor)
        return (
          <div key={formattedInstructor} className="flex items-center">
            <Button 
              variant={isSelected ? "default" : "outline"}
              size="sm"
              className="h-6 pl-2 pr-1 text-xs font-normal border-1 cursor-pointer flex items-center gap-1 relative group"
              onClick={(e) => {
                e.stopPropagation()
                onToggleInstructor(formattedInstructor)
              }}
              title={isSelected ? `Remove ${formattedInstructor} filter` : `Filter by ${formattedInstructor}`}
            >
              {formattedInstructor}
              <div className={`h-4 w-px mx-1 ${isSelected ? 'bg-white/40' : 'bg-gray-400/60'}`} /> {/* Visual separator */}
              <div
                className="h-4 w-4 p-0 flex items-center justify-center rounded-sm hover:bg-black/10 cursor-pointer transition-all duration-200 hover:scale-110"
                onClick={(e) => {
                  e.stopPropagation()
                  googleSearchAndOpen(`CUHK ${formattedInstructor}`)
                }}
                title={`Search Google for "CUHK ${formattedInstructor}" for more relevant results`}
              >
                <Search className={`w-2.5 h-2.5 transition-opacity ${isSelected ? 'text-white opacity-90 hover:opacity-100' : 'text-gray-600 opacity-70 hover:opacity-100'}`} />
              </div>
            </Button>
          </div>
        )
      })}
      {selectedInstructors.size > 0 && (
        <Button
          variant="destructive"
          size="sm"
          className="h-6 px-2 text-xs font-medium cursor-pointer"
          onClick={(e) => {
            e.stopPropagation()
            onClearAll()
          }}
          title="Clear all instructor filters"
        >
          Clear Instructors
        </Button>
      )}
    </div>
  )
}

function CourseCard({ 
  course, 
  currentTerm, 
  initialSelections = new Map(),
  onSectionsChange,
  onAddCourse,
  onRemoveCourse, 
  isAdded,
  hasSelectionsChanged,
  onSelectEnrollment,
  courseEnrollments
}: { 
  course: InternalCourse
  currentTerm: string
  initialSelections?: Map<string, string>
  onSectionsChange: (course: InternalCourse, selections: Map<string, string>) => void
  onAddCourse: (course: InternalCourse, localSelections: Map<string, string>) => void
  onRemoveCourse: (courseKey: string) => void
  isAdded: boolean
  hasSelectionsChanged: boolean
  onSelectEnrollment?: (enrollmentId: string | null) => void
  courseEnrollments: CourseEnrollment[]
}) {
  const [expanded, setExpanded] = useState(false)
  const [selectedInstructors, setSelectedInstructors] = useState<Set<string>>(new Set())
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set()) // 0=Monday, 1=Tuesday, ..., 4=Friday
  
  // Fully decoupled: CourseCard manages its own state
  const [localSelections, setLocalSelections] = useState<Map<string, string>>(initialSelections)
  const [showAllSectionTypes, setShowAllSectionTypes] = useState<Set<string>>(new Set())
  
  const courseKey = `${course.subject}${course.courseCode}`
  const sectionTypes = parseSectionTypes(course, currentTerm)
  
  
  // Get enrolled course for this course
  const enrolledCourse = courseEnrollments.find(enrollment => 
    enrollment.course.subject === course.subject && enrollment.course.courseCode === course.courseCode
  )
  
  // Use local format directly - much simpler!
  const isEnrollmentComplete = isCourseEnrollmentComplete(course, currentTerm, localSelections)

  // Instructor filter toggle function
  const toggleInstructorFilter = (instructor: string) => {
    const newSelected = new Set(selectedInstructors)
    if (newSelected.has(instructor)) {
      newSelected.delete(instructor)
    } else {
      newSelected.add(instructor)
    }
    setSelectedInstructors(newSelected)
    
    // Auto-expand when filters are applied
    if (newSelected.size > 0 && !expanded) {
      setExpanded(true)
    }

    // Critical fix: Clear section selections that don't match the new instructor filter
    // This maintains logical consistency between filtered view and selected sections
    if (newSelected.size > 0) {
      const updatedSelections = new Map<string, string>()
      
      // Check each current selection to see if it matches the instructor filter
      for (const [sectionType, sectionId] of localSelections) {
        const typeGroup = sectionTypes.find(tg => tg.type === sectionType)
        if (typeGroup) {
          const section = typeGroup.sections.find(s => s.id === sectionId)
          if (section) {
            // Check if this section has instructors matching the new filter
            const sectionMatchesFilter = section.meetings.some(meeting => {
              if (!meeting.instructor) return false
              const instructorNames = meeting.instructor.split(',').map(name => name.trim())
              return instructorNames.some(instructorName => {
                const formattedName = formatInstructorCompact(instructorName)
                return newSelected.has(formattedName)
              })
            })
            
            // Only keep selections that match the instructor filter
            if (sectionMatchesFilter) {
              updatedSelections.set(sectionType, sectionId)
            } else {
              console.log(`🔄 Cleared ${sectionType} selection: ${section.sectionCode} (instructor doesn't match filter)`)
            }
          }
        }
      }
      
      // Update local state and notify parent if selections changed
      if (updatedSelections.size !== localSelections.size || 
          Array.from(updatedSelections.entries()).some(([type, id]) => localSelections.get(type) !== id)) {
        setLocalSelections(updatedSelections)
        onSectionsChange(course, updatedSelections)
      }
    }
    // Note: When instructor filter is cleared (size = 0), we keep all existing selections
  }

  // Day filter toggle function
  const toggleDayFilter = (dayIndex: number) => {
    const newSelected = new Set(selectedDays)
    if (newSelected.has(dayIndex)) {
      newSelected.delete(dayIndex)
    } else {
      newSelected.add(dayIndex)
    }
    setSelectedDays(newSelected)
  }

  // Helper function to check if a section matches selected days
  // Uses inclusive approach: section is shown if ANY meeting falls on selected days
  const sectionMatchesDayFilter = (section: InternalSection): boolean => {
    if (selectedDays.size === 0) return true // No day filter applied
    
    return section.meetings.some(meeting => {
      const dayIndex = getDayIndex(meeting.time)
      return dayIndex !== -1 && selectedDays.has(dayIndex)
    })
  }

  // Get unique instructors from current term, sorted alphabetically
  const currentTermData = course.terms.find(term => term.termName === currentTerm)
  const instructors = Array.from(new Set(
    currentTermData?.sections.flatMap(section =>
      section.meetings.flatMap(meeting => {
        // Split instructor names by comma if multiple instructors are listed together
        const instructorString = meeting.instructor || ''
        return instructorString.split(',').map(name => name.trim()).filter(Boolean)
      })
    ) || []
  )).filter(Boolean).sort((a, b) => {
    // Sort alphabetically by the name part using utility function
    const nameA = removeInstructorTitle(a)
    const nameB = removeInstructorTitle(b)
    return nameA.localeCompare(nameB)
  })

  return (
    <Card 
      className={`py-5 gap-0 transition-all duration-200 ${
        !expanded 
          ? 'hover:shadow-lg hover:bg-gray-50 cursor-pointer' 
          : 'shadow-md'
      }`}
      onClick={!expanded ? () => setExpanded(true) : undefined}
    >
      <CardHeader className="pb-3">
        {/* Desktop Layout: Keep existing horizontal layout */}
        <div className="hidden sm:flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">
                {course.subject}{course.courseCode}
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  googleSearchAndOpen(`CUHK ${course.subject}${course.courseCode} Outline OR Syllabus`)
                }}
                className="h-6 px-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-200 cursor-pointer"
                title={`Search Google for "${course.subject} ${course.courseCode}" outline`}
              >
                <Search className="w-3 h-3 mr-1" />
                Course Outline
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  googleSearchAndOpen(`CUHK ${course.subject} ${course.courseCode} Reviews`)
                }}
                className="h-6 px-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-200 cursor-pointer"
                title={`Search Google for "${course.subject} ${course.courseCode}" reviews`}
              >
                <Search className="w-3 h-3 mr-1" />
                Course Reviews
              </Button>
            </div>
            <CardDescription className="text-base font-medium text-gray-700 mt-1">
              {course.title}
            </CardDescription>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant="secondary">{course.credits} credits</Badge>
              {course.gradingBasis && (
                <Badge variant="secondary" className="text-xs">
                  {course.gradingBasis}
                </Badge>
              )}
              {/* Show all instructors as filter toggle buttons */}
              {instructors.length > 0 && (
                <InstructorFilters
                  instructors={instructors}
                  selectedInstructors={selectedInstructors}
                  onToggleInstructor={toggleInstructorFilter}
                  onClearAll={() => setSelectedInstructors(new Set())}
                  isMobile={false}
                />
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 ml-2">
            {isAdded ? (
              <>
                {/* Remove button for enrolled courses */}
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemoveCourse(courseKey)
                  }}
                  className="min-w-[70px] cursor-pointer"
                  title="Remove course from cart"
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  Remove
                </Button>
                
                {/* Go to Cart button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (onSelectEnrollment && enrolledCourse) {
                      onSelectEnrollment(enrolledCourse.courseId)
                    }
                  }}
                  className="min-w-[80px] cursor-pointer"
                  title="Go to course in shopping cart"
                >
                  <ShoppingCart className="w-3 h-3 mr-1" />
                  Go to Cart
                </Button>
                
                {/* Replace/Added status button - for courses already in cart */}
                <Button
                  variant={hasSelectionsChanged && isEnrollmentComplete ? "default" : "secondary"}
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (hasSelectionsChanged && isEnrollmentComplete) {
                      onAddCourse(course, localSelections)
                    }
                  }}
                  disabled={!hasSelectionsChanged || !isEnrollmentComplete}
                  className="min-w-[80px] cursor-pointer"
                  title={hasSelectionsChanged && isEnrollmentComplete
                    ? "Replace course with new section selections" 
                    : "Course already added to cart"}
                >
                  {hasSelectionsChanged && isEnrollmentComplete ? "Replace Cart" : "Added ✓"}
                </Button>
              </>
            ) : (
              /* Add button for non-enrolled courses */
              <Button
                variant={isEnrollmentComplete ? "default" : "secondary"}
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  if (isEnrollmentComplete) {
                    onAddCourse(course, localSelections)
                  }
                }}
                disabled={!isEnrollmentComplete}
                className="min-w-[80px] cursor-pointer"
                title={!isEnrollmentComplete ? "Select required sections to add course (some types may not have compatible options)" : "Add course to cart"}
              >
                {isEnrollmentComplete ? "Add to Cart" : "Select Sections"}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                setExpanded(!expanded)
              }}
              className="w-8 h-8 p-0 cursor-pointer"
              title={expanded ? "Hide sections" : "Show sections"}
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Mobile Layout: Course header + search buttons below */}
        <div className="sm:hidden space-y-3">
          {/* Course header */}
          <div>
            <CardTitle className="text-lg">
              {course.subject}{course.courseCode}
            </CardTitle>
            <CardDescription className="text-base font-medium text-gray-700 mt-1">
              {course.title}
            </CardDescription>
            
            {/* Search buttons below course header */}
            <div className="flex items-center gap-2 mt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  googleSearchAndOpen(`CUHK ${course.subject}${course.courseCode} Outline OR Syllabus`)
                }}
                className="h-6 px-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-200 cursor-pointer"
                title={`Search Google for "${course.subject} ${course.courseCode}" outline`}
              >
                <Search className="w-3 h-3 mr-1" />
                <span className="hidden xs:inline">Course Outline</span>
                <span className="xs:hidden">Outline</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  googleSearchAndOpen(`CUHK ${course.subject} ${course.courseCode} Reviews`)
                }}
                className="h-6 px-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-200 cursor-pointer"
                title={`Search Google for "${course.subject} ${course.courseCode}" reviews`}
              >
                <Search className="w-3 h-3 mr-1" />
                <span className="hidden xs:inline">Course Reviews</span>
                <span className="xs:hidden">Reviews</span>
              </Button>
            </div>
          </div>

          {/* Course metadata */}
          <div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant="secondary">{course.credits} credits</Badge>
              {course.gradingBasis && (
                <Badge variant="secondary" className="text-xs">
                  {course.gradingBasis}
                </Badge>
              )}
              {/* Show instructors as filter toggle buttons on mobile */}
              {instructors.length > 0 && (
                <InstructorFilters
                  instructors={instructors}
                  selectedInstructors={selectedInstructors}
                  onToggleInstructor={toggleInstructorFilter}
                  onClearAll={() => setSelectedInstructors(new Set())}
                  isMobile={true}
                />
              )}
            </div>
          </div>

          {/* Action buttons section - vertical hierarchy */}
          <div className="border-t border-gray-100 pt-3 space-y-2">
            {isAdded ? (
              <>
                {/* Primary action: Replace/Added status - full width */}
                <Button
                  variant={hasSelectionsChanged && isEnrollmentComplete ? "default" : "secondary"}
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (hasSelectionsChanged && isEnrollmentComplete) {
                      onAddCourse(course, localSelections)
                    }
                  }}
                  disabled={!hasSelectionsChanged || !isEnrollmentComplete}
                  className="w-full cursor-pointer"
                  title={hasSelectionsChanged && isEnrollmentComplete
                    ? "Replace course with new section selections" 
                    : "Course already added to cart"}
                >
                  {hasSelectionsChanged && isEnrollmentComplete ? "Replace Cart" : "Added ✓"}
                </Button>
                
                {/* Secondary actions: Go to Cart + Remove - side by side */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (onSelectEnrollment && enrolledCourse) {
                        onSelectEnrollment(enrolledCourse.courseId)
                      }
                    }}
                    className="flex-1 cursor-pointer"
                    title="Go to course in shopping cart"
                  >
                    <ShoppingCart className="w-3 h-3 mr-1" />
                    Go to Cart
                  </Button>
                  
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemoveCourse(courseKey)
                    }}
                    className="flex-1 cursor-pointer"
                    title="Remove course from cart"
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    Remove
                  </Button>
                </div>
              </>
            ) : (
              /* Add button for non-enrolled courses - full width */
              <Button
                variant={isEnrollmentComplete ? "default" : "secondary"}
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  if (isEnrollmentComplete) {
                    onAddCourse(course, localSelections)
                  }
                }}
                disabled={!isEnrollmentComplete}
                className="w-full cursor-pointer"
                title={!isEnrollmentComplete ? "Select required sections to add course (some types may not have compatible options)" : "Add course to cart"}
              >
                <Plus className="w-3 h-3 mr-1" />
                {isEnrollmentComplete ? "Add to Cart" : "Select Sections"}
              </Button>
            )}
            
            {/* Expand button - separate as it's different from cart actions */}
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                setExpanded(!expanded)
              }}
              className="w-full cursor-pointer"
              title={expanded ? "Hide sections" : "Show sections"}
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              <span className="ml-2">{expanded ? "Hide Sections" : "Show Sections"}</span>
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0">
          <div className="space-y-4 pt-3 border-t">
            {/* Section Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-700">Filters:</span>
              
              {/* Day filter buttons */}
              {(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const).map((dayName, dayIndex) => {
                const isSelected = selectedDays.has(dayIndex)
                const shortName = dayName.slice(0, 3) // Mon, Tue, Wed, Thu, Fri
                
                return (
                  <Button
                    key={dayName}
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleDayFilter(dayIndex)}
                    className="h-6 px-2 text-xs font-normal border-1 cursor-pointer"
                    title={isSelected ? `Remove ${dayName} filter` : `Filter by ${dayName}`}
                  >
                    {shortName}
                  </Button>
                )
              })}
              
              {/* Clear day filters button */}
              {selectedDays.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setSelectedDays(new Set())
                  }}
                  className="h-6 px-2 text-xs font-medium cursor-pointer"
                  title="Clear all day filters"
                >
                  Clear Days
                </Button>
              )}
            </div>
            
            {/* Section Selection */}
            {sectionTypes.map(typeGroup => {
              // Get currently selected sections for this course to check compatibility
              // Get currently selected sections from local selections
              const currentlySelectedSections: InternalSection[] = []
              for (const [sectionType, sectionId] of localSelections) {
                const typeGroup = sectionTypes.find(t => t.type === sectionType)
                if (typeGroup) {
                  const section = typeGroup.sections.find(s => s.id === sectionId)
                  if (section) {
                    currentlySelectedSections.push(section)
                  }
                }
              }
              
              // Only constrain by HIGHER priority selections (hierarchical flow)
              const higherPrioritySelections = currentlySelectedSections.filter(s => {
                const sPriority = getSectionTypePriority(s.sectionType, sectionTypes)
                return sPriority < typeGroup.priority  // Lower number = higher priority
              })
              
              // Categorize sections as compatible/incompatible based on higher priority selections only
              const { incompatible } = categorizeCompatibleSections(
                typeGroup.sections, 
                higherPrioritySelections
              )
              
              // Note: Higher priority sections can always be changed freely (implemented in logic above)
              
              return (
                <div key={typeGroup.type}>
                  <h4 className="flex flex-wrap items-center gap-2 font-medium text-sm text-gray-700 mb-2">
                    <span>{typeGroup.icon}</span>
                    <span>{typeGroup.displayName}</span>
                    <Badge variant="secondary" className="text-xs">
                      Pick 1
                    </Badge>
                    {/* Show instructor filter status */}
                    {selectedInstructors.size > 0 && (
                      <Badge variant="outline" className="text-xs text-purple-700 border-purple-300 bg-purple-50">
                        Filtered by {selectedInstructors.size} instructor{selectedInstructors.size > 1 ? 's' : ''}
                      </Badge>
                    )}
                  </h4>
                  
                  {/* Simplified show all toggle - always available for user control */}
                  {(() => {
                    const showingAllForType = showAllSectionTypes.has(typeGroup.type)
                    const selectedSectionId = localSelections.get(typeGroup.type)
                    
                    // Calculate sections using the EXACT same logic as shouldShowSection
                    const countSectionWithFilters = (section: InternalSection, applySmartFiltering: boolean = true) => {
                      // Priority 1: Instructor filter (always applied)
                      if (selectedInstructors.size > 0) {
                        const matchesInstructorFilter = section.meetings.some(meeting => {
                          if (!meeting.instructor) return false
                          const instructorNames = meeting.instructor.split(',').map(name => name.trim())
                          return instructorNames.some(instructorName => {
                            const formattedName = formatInstructorCompact(instructorName)
                            return selectedInstructors.has(formattedName)
                          })
                        })
                        if (!matchesInstructorFilter) return false
                      }
                      
                      // Priority 2: Day filter (always applied)
                      if (!sectionMatchesDayFilter(section)) return false
                      
                      // Priority 3: Show all override (user explicitly wants to see everything)
                      if (showingAllForType) {
                        return true
                      }
                      
                      // Priority 4: Smart filtering (only if requested)
                      if (applySmartFiltering) {
                        if (selectedSectionId) return section.id === selectedSectionId
                        return !incompatible.includes(section)
                      }
                      
                      return true
                    }
                    
                    // Count sections after applying all filters but WITHOUT smart filtering (base available count)
                    const totalAvailableSections = typeGroup.sections.filter(section => 
                      countSectionWithFilters(section, false)
                    ).length
                    
                    // Count sections after applying all filters INCLUDING smart filtering (actually visible count)
                    const visibleSectionsCount = typeGroup.sections.filter(section => 
                      countSectionWithFilters(section, true)
                    ).length
                    
                    const hiddenSectionsCount = totalAvailableSections - visibleSectionsCount
                    
                    // Only show the toggle when there are actually hidden sections
                    if (hiddenSectionsCount > 0 || showingAllForType) {
                      return (
                        <div className="text-xs text-gray-500 flex items-center gap-2 mb-3">
                          <span>
                            {showingAllForType 
                              ? `All ${visibleSectionsCount} options shown`
                              : `${hiddenSectionsCount} option${hiddenSectionsCount === 1 ? '' : 's'} hidden`
                            }
                          </span>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => {
                              setShowAllSectionTypes(prev => {
                                const updated = new Set(prev)
                                if (updated.has(typeGroup.type)) {
                                  updated.delete(typeGroup.type)
                                } else {
                                  updated.add(typeGroup.type)
                                }
                                return updated
                              })
                            }}
                            className="h-5 px-2 text-xs text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-full"
                            title={showingAllForType 
                              ? `Hide extra ${typeGroup.displayName.toLowerCase()} options` 
                              : `Show all ${typeGroup.displayName.toLowerCase()} options`
                            }
                          >
                            {showingAllForType ? "Hide extra" : "Show all"}
                          </Button>
                        </div>
                      )
                    }
                    return null
                  })()}
                
                {/* Display sections horizontally for easy comparison - 4 columns on large screens */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {(() => {
                    // Simplified filtering logic - single function with clear priorities
                    const shouldShowSection = (section: InternalSection) => {
                      // Priority 1: Instructor filter (always applied)
                      if (selectedInstructors.size > 0) {
                        const matchesInstructorFilter = section.meetings.some(meeting => {
                          if (!meeting.instructor) return false
                          const instructorNames = meeting.instructor.split(',').map(name => name.trim())
                          return instructorNames.some(instructorName => {
                            const formattedName = formatInstructorCompact(instructorName)
                            return selectedInstructors.has(formattedName)
                          })
                        })
                        if (!matchesInstructorFilter) return false
                      }
                      
                      // Priority 2: Day filter (always applied)
                      if (!sectionMatchesDayFilter(section)) return false
                      
                      // Priority 3: Show all override (user explicitly wants to see everything)
                      if (showAllSectionTypes.has(typeGroup.type)) {
                        return true
                      }
                      
                      // Priority 4: Smart filtering
                      const selectedSectionId = localSelections.get(typeGroup.type)
                      
                      // If section is selected, only show selected section
                      if (selectedSectionId) {
                        return section.id === selectedSectionId
                      }
                      
                      // If no selection, show compatible sections only
                      return !incompatible.includes(section)
                    }
                    
                    return typeGroup.sections.filter(shouldShowSection)
                  })()
                    .map(section => {
                    const isSelected = localSelections.get(typeGroup.type) === section.id
                    const isIncompatible = incompatible.includes(section)
                    const sectionPrefix = getSectionPrefix(section.sectionCode)
                    
                    // Check for time conflicts with current schedule
                    const conflictInfo = checkSectionConflict(section, courseEnrollments)
                    const hasTimeConflict = conflictInfo.hasConflict // Show conflicts even for selected sections
                    
                    return (
                      <div 
                        key={section.id}
                        className={`p-2 rounded transition-all ${
                          isSelected 
                            ? 'border border-blue-500 bg-blue-50 shadow-md ring-1 ring-blue-200 cursor-pointer' 
                            : isIncompatible 
                              ? 'border border-gray-200 opacity-40 cursor-not-allowed grayscale'
                              : hasTimeConflict
                                ? 'border border-red-300 hover:bg-red-50 cursor-pointer shadow-sm'
                                : 'border border-green-500 hover:bg-green-50 cursor-pointer shadow-sm'
                        }`}
                        onClick={() => {
                          if (!isIncompatible) {
                            const newSelections = new Map(localSelections)
                            if (newSelections.get(typeGroup.type) === section.id) {
                              // Remove selection
                              newSelections.delete(typeGroup.type)
                              // Note: Keep "show all" state - let user control it explicitly
                            } else {
                              // Set new selection
                              newSelections.set(typeGroup.type, section.id)
                              
                              // Cascade clearing: if this is a higher-priority selection, 
                              // clear incompatible lower-priority selections
                              const newSectionPriority = getSectionTypePriority(typeGroup.type as SectionType, sectionTypes)
                              
                              // Find lower-priority selections to potentially clear
                              const selectionsToCheck = Array.from(newSelections.entries())
                              for (const [otherType, otherSectionId] of selectionsToCheck) {
                                if (otherType === typeGroup.type) continue // Skip self
                                
                                const otherPriority = getSectionTypePriority(otherType as SectionType, sectionTypes)
                                
                                // Only clear LOWER priority selections (higher number = lower priority)
                                if (otherPriority > newSectionPriority) {
                                  // Check if the new selection makes the other selection incompatible
                                  const otherTypeGroup = sectionTypes.find(tg => tg.type === otherType)
                                  if (otherTypeGroup) {
                                    const otherSection = otherTypeGroup.sections.find(s => s.id === otherSectionId)
                                    
                                    // Check compatibility using the new selection as constraint
                                    if (otherSection) {
                                      const { incompatible } = categorizeCompatibleSections(
                                        otherTypeGroup.sections,
                                        [section] // New higher-priority selection as constraint
                                      )
                                      
                                      // If the other section is now incompatible, clear it
                                      if (incompatible.includes(otherSection)) {
                                        newSelections.delete(otherType)
                                      }
                                    }
                                  }
                                }
                              }
                            }
                            setLocalSelections(newSelections)
                            onSectionsChange(course, newSelections)
                            // Note: Removed auto-reset of showAllSectionTypes - let user control it explicitly
                          }
                        }}
                        title={
                          isIncompatible 
                            ? `Incompatible with selected ${sectionPrefix || 'universal'}-cohort sections`
                            : hasTimeConflict
                              ? `Time conflict with: ${conflictInfo.conflictingSections.join(', ')}`
                              : undefined
                        }
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <span className="font-mono text-xs font-medium flex-shrink-0 text-gray-600">{section.sectionCode}</span>
                            {hasTimeConflict && (
                              <div className="flex items-center gap-0.5 text-red-600 text-xs min-w-0 flex-1">
                                <AlertTriangle className="w-3 h-3 text-red-500 flex-shrink-0" />
                                <span className="truncate" title={`Time conflict with: ${conflictInfo.conflictingSections.join(', ')}`}>
                                  {conflictInfo.conflictingSections.join(', ')}
                                </span>
                              </div>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-6 h-6 p-0"
                              title={isSelected ? "Remove selection" : "Select this section"}
                            >
                              {isSelected ? (
                                <X className="w-3 h-3 text-red-500" />
                              ) : (
                                <Plus className="w-3 h-3 text-gray-500" />
                              )}
                            </Button>
                          </div>
                        </div>
                        
                        {/* Row 2: Enrollment Badges */}
                        <div className="flex items-center gap-1 mb-2">
                          {getAvailabilityBadges(section.availability).map((badge) => (
                            <Badge
                              key={badge.type}
                              className={`text-[10px] px-1 py-0 ${badge.style.className}`}
                              title={
                                badge.type === 'status' 
                                  ? `Course status: ${badge.text}`
                                  : badge.type === 'availability' 
                                    ? `${section.availability.availableSeats} seats available out of ${section.availability.capacity}`
                                    : `${section.availability.waitlistTotal} people waiting (capacity: ${section.availability.waitlistCapacity})`
                              }
                            >
                              {badge.text}
                            </Badge>
                          ))}
                        </div>
                        
                        {/* Row 3: Teaching Language */}
                        {section.classAttributes && (
                          <div className="flex items-center gap-1 text-gray-500 text-[11px] mb-2">
                            <span className="flex-shrink-0">🌐</span>
                            <span className="truncate" title={`Language of instruction: ${section.classAttributes}`}>
                              {section.classAttributes}
                            </span>
                          </div>
                        )}
                        
                        {/* Meetings displayed in unified 3-row emoji format */}
                        <div className="space-y-1">
                          {getUniqueMeetings(section.meetings).map((meeting, index) => {
                            const formattedTime = formatTimeCompact(meeting?.time || 'TBA')
                            const formattedInstructor = formatInstructorCompact(meeting?.instructor || 'TBA')
                            const location = meeting?.location || 'TBA'
                            
                            return (
                              <div key={index} className="bg-white border border-gray-200 rounded px-2 py-1.5 shadow-sm">
                                {/* Row 1: Time */}
                                <div className="flex items-center gap-1 text-[11px]">
                                  <span>⏰</span>
                                  <span className="font-mono text-gray-600">{formattedTime}</span>
                                </div>
                                {/* Row 2: Instructor */}
                                <div className="flex items-center gap-1 text-gray-600 text-[11px] mt-1">
                                  <span>👨‍🏫</span>
                                  <div className="flex items-center gap-1 min-w-0 flex-1">
                                    <span className="truncate" title={formattedInstructor}>
                                      {formattedInstructor}
                                    </span>
                                    {formattedInstructor !== 'Staff' && (
                                      <button
                                        onClick={(e) => {
                                        e.stopPropagation()
                                          googleSearchAndOpen(`CUHK ${formattedInstructor}`)
                                        }}
                                        className="flex-shrink-0 p-0.5 hover:bg-gray-100 rounded cursor-pointer transition-colors duration-200"
                                        title={`Search Google for "CUHK ${formattedInstructor}"`}
                                      >
                                        <Search className="w-2.5 h-2.5 text-gray-400 hover:text-gray-600" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                                {/* Row 3: Location */}
                                <div className="flex items-center gap-1 text-gray-600 text-[11px] mt-1">
                                  <span>📍</span>
                                  <div className="flex items-center gap-1 min-w-0 flex-1">
                                    <span className="truncate" title={location}>
                                      {location}
                                    </span>
                                    {location !== 'TBA' && location !== 'No Room Required' && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          googleMapsSearchAndOpen(location)
                                        }}
                                        className="flex-shrink-0 p-0.5 hover:bg-gray-100 rounded cursor-pointer transition-colors duration-200"
                                        title={`View "${location}" on Google Maps`}
                                      >
                                        <MapPin className="w-2.5 h-2.5 text-gray-400 hover:text-gray-600" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              )
            })}

            {/* Course Details */}
            <div className="border-t pt-4 space-y-3">
              {/* Description */}
              {course.description && (
                <div>
                  <h4 className="font-semibold text-sm text-gray-700 mb-1">Description</h4>
                  <p className="text-sm text-gray-600">{course.description}</p>
                </div>
              )}

              {/* Enrollment Requirement */}
              {course.enrollmentRequirement && (
                <div>
                  <h4 className="font-semibold text-sm text-gray-700 mb-1">Enrollment Requirement</h4>
                  <p className="text-sm text-gray-600">{course.enrollmentRequirement}</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
