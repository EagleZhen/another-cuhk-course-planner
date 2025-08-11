'use client'

import { useState, useEffect, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronDown, ChevronUp, Plus, X, Info, Trash2, Search, ShoppingCart, Users, Clock } from 'lucide-react'
import { parseSectionTypes, isCourseEnrollmentComplete, getUniqueMeetings, getSectionPrefix, categorizeCompatibleSections, getSelectedSectionsForCourse, clearIncompatibleLowerSelections, getSectionTypePriority, formatTimeCompact, formatInstructorCompact, getAvailabilityBadges, type InternalCourse, type CourseEnrollment, type SectionType } from '@/lib/courseUtils'
import { transformExternalCourseData } from '@/lib/validation'

// Using clean internal types only


interface CourseSearchProps {
  onAddCourse: (course: InternalCourse, sectionsMap: Map<string, string>) => void
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
    
    const currentSelections = getSelectedSectionsForCourse(course, currentTerm, selectedSections)
    
    // Compare section IDs
    if (currentSelections.length !== enrolled.selectedSections.length) return true
    
    return currentSelections.some(currentSection => 
      !enrolled.selectedSections.some(enrolledSection => 
        enrolledSection.id === currentSection.id
      )
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
        
        // Find the oldest scraping timestamp and notify parent
        if (scrapingTimestamps.length > 0 && onDataUpdate) {
          const oldestTimestamp = new Date(Math.min(...scrapingTimestamps.map(d => d.getTime())))
          console.log(`🕒 Oldest data from: ${oldestTimestamp.toLocaleString()} (${scrapingTimestamps.length} files checked)`)
          onDataUpdate(oldestTimestamp, allCoursesData) // Pass both timestamp and fresh course data for sync
        }
        
      } catch (error) {
        console.error('Failed to load course data:', error)
        setLoading(false)
      } finally {
        setLoadingProgress({ loaded: 0, total: 0, currentSubject: '' })
      }
    }

    loadCourseData()
  }, [onDataUpdate, currentTerm, hasDataLoaded]) // Re-run when term changes to get term-specific subjects

  // Real-time search with useMemo for performance, filtered by current term
  // Helper function to open Google search for course reviews
  const searchCourseReviews = (course: InternalCourse) => {
    const query = `CUHK ${course.subject} ${course.courseCode} review`
    const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`
    window.open(googleSearchUrl, '_blank', 'noopener,noreferrer')
  }

  // Helper function to open Google search for instructor
  const searchInstructor = (instructorName: string) => {
    const query = `${instructorName}`
    const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`
    window.open(googleSearchUrl, '_blank', 'noopener,noreferrer')
  }

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
    
    // Determine if user has applied any filters or search
    const hasFiltersOrSearch = searchTerm.trim() || selectedSubjects.size > 0
    
    // Apply search term filter if provided
    let finalCourses = filteredCourses
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase()
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

    // Simple limiting logic based on user intent
    const limit = hasFiltersOrSearch ? 100 : 10

    return {
      courses: finalCourses.slice(0, limit),
      total: finalCourses.length,
      isLimited: finalCourses.length > limit
    }
  }, [searchTerm, allCourses, currentTerm, selectedSubjects])

  return (
    <div className="space-y-4">
      {/* Sticky Search Input with Term Filter Hint */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 pb-4 -mx-4 px-4 pt-4">
        <div className="w-full space-y-2">
          <Input
            type="text"
            placeholder="Search courses (e.g., UGFH1000, In Dialogue with Humanity, YU Bei)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
          />
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
                    <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-md shadow-lg min-w-[200px]">
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
                    <span>Use subject filters to focus on specific academic areas</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full mt-2 flex-shrink-0"></div>
                    <span>Search by course code (e.g., &ldquo;UGFH1000&rdquo;), course title (e.g., &ldquo;In Dialogue with Humanity &rdquo;) or instructor name for precise results</span>
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
                <p className="text-sm text-gray-500 max-w-md mx-auto">
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
                    {selectedSubjects.size > 0 && <p>• Removing subject filters</p>}
                    <p>• Searching for course codes like &ldquo;CSCI3100&rdquo;</p>
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
            <div className="text-sm text-gray-600 mb-3">
              Showing {searchResults.courses.length} course{searchResults.courses.length !== 1 ? 's' : ''}
              {searchResults.total > searchResults.courses.length && (
                <span className="font-medium"> of {searchResults.total} total</span>
              )}
              {searchTerm && ` matching "${searchTerm}"`}
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
                  selectedSections={selectedSections}
                  onSearchReviews={searchCourseReviews}
                  onSearchInstructor={searchInstructor}
                  onSectionToggle={(courseKey, sectionType, sectionId) => {
                    const newMap = new Map(selectedSections)
                    const selectionKey = `${courseKey}_${sectionType}`
                    
                    if (newMap.get(selectionKey) === sectionId) {
                      // Remove selection
                      newMap.delete(selectionKey)
                      onSelectedSectionsChange(newMap)
                    } else {
                      // Set new selection (replaces any existing selection for this type)
                      newMap.set(selectionKey, sectionId)
                      
                      // Find the course to get section types for cascade clearing
                      const targetCourse = searchResults.courses.find(c => `${c.subject}${c.courseCode}` === courseKey)
                      if (targetCourse) {
                        const sectionTypes = parseSectionTypes(targetCourse, currentTerm)
                        // Clear any lower-priority incompatible selections
                        const clearedMap = clearIncompatibleLowerSelections(
                          newMap, 
                          courseKey, 
                          sectionType as SectionType, // Type assertion for section type compatibility
                          sectionId, 
                          sectionTypes, 
                          targetCourse, 
                          currentTerm
                        )
                        onSelectedSectionsChange(clearedMap)
                      } else {
                        onSelectedSectionsChange(newMap)
                      }
                    }
                  }}
                  onAddCourse={onAddCourse}
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

function CourseCard({ 
  course, 
  currentTerm, 
  selectedSections, 
  onSearchReviews,
  onSearchInstructor,
  onSectionToggle, 
  onAddCourse,
  onRemoveCourse, 
  isAdded,
  hasSelectionsChanged,
  onSelectEnrollment,
  courseEnrollments
}: { 
  course: InternalCourse
  currentTerm: string
  selectedSections: Map<string, string>
  onSearchReviews: (course: InternalCourse) => void
  onSearchInstructor: (instructorName: string) => void
  onSectionToggle: (courseKey: string, sectionType: string, sectionId: string) => void
  onAddCourse: (course: InternalCourse, sectionsMap: Map<string, string>) => void
  onRemoveCourse: (courseKey: string) => void
  isAdded: boolean
  hasSelectionsChanged: boolean
  onSelectEnrollment?: (enrollmentId: string | null) => void
  courseEnrollments: CourseEnrollment[]
}) {
  const [expanded, setExpanded] = useState(false)
  const courseKey = `${course.subject}${course.courseCode}`
  const sectionTypes = parseSectionTypes(course, currentTerm)
  
  // Get enrolled course for this course
  const enrolledCourse = courseEnrollments.find(enrollment => 
    enrollment.course.subject === course.subject && enrollment.course.courseCode === course.courseCode
  )
  const isEnrollmentComplete = isCourseEnrollmentComplete(course, currentTerm, selectedSections)

  // Get unique instructors from current term
  const currentTermData = course.terms.find(term => term.termName === currentTerm)
  const instructors = Array.from(new Set(
    currentTermData?.sections.flatMap(section =>
      section.meetings.flatMap(meeting => {
        // Split instructor names by comma if multiple instructors are listed together
        const instructorString = meeting.instructor || ''
        return instructorString.split(',').map(name => name.trim()).filter(Boolean)
      })
    ) || []
  )).filter(Boolean)

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
        <div className="flex items-start justify-between">
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
                  onSearchReviews(course)
                }}
                className="h-6 px-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-200 cursor-pointer"
                title={`Search Google for "${course.subject} ${course.courseCode}" reviews`}
              >
                <Search className="w-3 h-3 mr-1" />
                Reviews
              </Button>
            </div>
            <CardDescription className="text-base font-medium text-gray-700 mt-1">
              {course.title}
            </CardDescription>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant="outline">{course.credits} credits</Badge>
              {course.gradingBasis && (
                <Badge variant="outline" className="text-xs">
                  {course.gradingBasis}
                </Badge>
              )}
              {/* Show instructors as badges with smart truncation */}
              {instructors.length > 0 && (
                <>
                  {instructors.slice(0, 4).map(instructor => {
                    const formattedInstructor = formatInstructorCompact(instructor)
                    return (
                      <Badge 
                        key={formattedInstructor}
                        variant="secondary" 
                        className="text-xs text-gray-700 hover:text-gray-900 hover:bg-gray-200 cursor-pointer transition-colors"
                        onClick={(e) => {
                          e.stopPropagation()
                          onSearchInstructor(formattedInstructor)
                        }}
                        title={`Search Google for "${formattedInstructor}"`}
                      >
                        {formattedInstructor}
                      </Badge>
                    )
                  })}
                  {instructors.length > 4 && (
                    <Badge 
                      variant="outline" 
                      className="text-xs text-gray-500"
                      title={`Additional instructors: ${instructors.slice(4).map(i => formatInstructorCompact(i)).join(', ')}`}
                    >
                      +{instructors.length - 4} more
                    </Badge>
                  )}
                </>
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
                      onAddCourse(course, selectedSections)
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
                    onAddCourse(course, selectedSections)
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
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0">
          <div className="space-y-4 pt-3 border-t">
            {/* Section Selection */}
            {sectionTypes.map(typeGroup => {
              // Get currently selected sections for this course to check compatibility
              const currentlySelectedSections = getSelectedSectionsForCourse(course, currentTerm, selectedSections)
              
              // Only constrain by HIGHER priority selections (hierarchical flow)
              const higherPrioritySelections = currentlySelectedSections.filter(s => {
                const sPriority = getSectionTypePriority(s.sectionType, sectionTypes)
                return sPriority < typeGroup.priority  // Lower number = higher priority
              })
              
              // Categorize sections as compatible/incompatible based on higher priority selections only
              const { compatible, incompatible, hasNoCompatible } = categorizeCompatibleSections(
                typeGroup.sections, 
                higherPrioritySelections
              )
              
              // Note: Higher priority sections can always be changed freely (implemented in logic above)
              
              return (
                <div key={typeGroup.type}>
                  <h4 className="flex items-center gap-2 font-medium text-sm text-gray-700 mb-2">
                    <span>{typeGroup.icon}</span>
                    <span>{typeGroup.displayName}</span>
                    <Badge variant="outline" className="text-xs">
                      Pick 1
                    </Badge>
                    {/* Show positive availability messaging */}
                    {hasNoCompatible ? (
                      <Badge variant="secondary" className="text-xs">
                        No compatible options
                      </Badge>
                    ) : compatible.length < typeGroup.sections.length ? (
                      <Badge variant="outline" className="text-xs text-green-700 border-green-300 bg-green-50">
                        {compatible.length} available
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-blue-700 border-blue-300 bg-blue-50">
                        All {typeGroup.sections.length} available
                      </Badge>
                    )}
                  </h4>
                
                {/* Display sections horizontally for easy comparison - 4 columns on large screens */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {typeGroup.sections.map(section => {
                    const isSelected = selectedSections.get(`${courseKey}_${typeGroup.type}`) === section.id
                    const isIncompatible = incompatible.includes(section)
                    const sectionPrefix = getSectionPrefix(section.sectionCode)
                    
                    return (
                      <div 
                        key={section.id}
                        className={`p-2 rounded transition-all ${
                          isSelected 
                            ? 'border border-blue-500 bg-blue-50 shadow-md ring-1 ring-blue-200 cursor-pointer' 
                            : isIncompatible 
                              ? 'border border-gray-200 opacity-40 cursor-not-allowed grayscale' 
                              : 'border border-green-200 hover:border-green-500 hover:bg-green-50 cursor-pointer shadow-sm'
                        }`}
                        onClick={() => !isIncompatible && onSectionToggle(courseKey, typeGroup.type, section.id)}
                        title={isIncompatible ? `Incompatible with selected ${sectionPrefix || 'universal'}-cohort sections` : undefined}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-medium">{section.sectionCode}</span>
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
                        
                        {/* Teaching Language + Availability - section level */}
                        {(section.classAttributes || getAvailabilityBadges(section.availability).length > 0) && (
                          <div className="flex items-center justify-between mb-2 gap-2">
                            {section.classAttributes ? (
                              <div className="flex items-center gap-1 text-gray-500 text-[12px] min-w-0 flex-1">
                                <span className="flex-shrink-0">🌐</span>
                                <span className="truncate" title={`Language of instruction: ${section.classAttributes}`}>
                                  {section.classAttributes}
                                </span>
                              </div>
                            ) : <div className="flex-1" />}
                            
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {getAvailabilityBadges(section.availability).map((badge) => (
                                <Badge
                                  key={badge.type}
                                  className={`text-[10px] ${badge.style.className} flex items-center gap-1`}
                                  title={badge.type === 'availability' 
                                    ? `${section.availability.status}: ${section.availability.availableSeats} seats available out of ${section.availability.capacity}`
                                    : `Waitlist: ${section.availability.waitlistTotal} people waiting (capacity: ${section.availability.waitlistCapacity})`
                                  }
                                >
                                  {badge.type === 'availability' ? (
                                    <><Users className="w-2.5 h-2.5" />{badge.text}</>
                                  ) : (
                                    <><Clock className="w-2.5 h-2.5" />{badge.text}</>
                                  )}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Meetings displayed compactly with time+instructor on same row */}
                        <div className="space-y-1">
                          {getUniqueMeetings(section.meetings).map((meeting, index) => {
                            const formattedTime = formatTimeCompact(meeting?.time || 'TBD')
                            const formattedInstructor = formatInstructorCompact(meeting?.instructor || 'TBD')
                            const location = meeting?.location || 'TBD'
                            
                            return (
                              <div key={index} className="bg-white border border-gray-200 rounded px-2 py-1.5 shadow-sm">
                                <div className="flex items-center justify-between text-[11px] gap-2">
                                  <span className="font-medium font-mono text-gray-900 flex-shrink-0">{formattedTime}</span>
                                  <span 
                                    className="text-gray-600 truncate text-right flex-1 min-w-0"
                                    title={formattedInstructor}
                                  >
                                    {formattedInstructor}
                                  </span>
                                </div>
                                {location !== 'TBD' && (
                                  <div className="flex items-center gap-1 text-gray-500 text-[10px] mt-1">
                                    <span>📍</span>
                                    <span className="truncate" title={location}>{location}</span>
                                  </div>
                                )}
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

              {/* Instructors */}
              {instructors.length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm text-gray-700 mb-1">Instructors</h4>
                  <div className="flex flex-wrap gap-1">
                    {instructors.map(instructor => {
                      const formattedInstructor = formatInstructorCompact(instructor)
                      return (
                        <Badge 
                          key={formattedInstructor}
                          variant="outline" 
                          className="text-xs hover:bg-gray-100 cursor-pointer transition-colors"
                          onClick={(e) => {
                            e.stopPropagation()
                            onSearchInstructor(formattedInstructor)
                          }}
                          title={`Search Google for "${formattedInstructor}"`}
                        >
                          {formattedInstructor}
                        </Badge>
                      )
                    })}
                  </div>
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
