# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**CUHK Course Planner**: Next.js web application solving outdated course data problems with enterprise-grade architecture.

**Components:**
1. **Course Data Scraper** (`cuhk_scraper.py`): ✅ **PRODUCTION READY** - Python scraper with crash-resistant JSONL recovery
2. **Web Interface**: 🏆 **ENTERPRISE-GRADE** - Type-safe React frontend with clean architecture

## Current System Status (January 2025)

### **🏗️ Production-Ready Architecture**

**Clean Three-Layer System:**
```typescript
External JSON → Zod Validation → Internal Types → React Components
     ↓               ↓              ↓               ↓
Raw scraped     Runtime check    Clean domain    Type-safe UI
```

**File Structure:**
```
web/src/
├── app/page.tsx              # State hub + localStorage persistence
├── components/
│   ├── CourseSearch.tsx      # Search + section compatibility  
│   ├── WeeklyCalendar.tsx    # Dynamic config + conflict zones
│   └── ShoppingCart.tsx      # Section cycling + enrollment mgmt
└── lib/
    ├── types.ts              # Internal models (zero `any`)
    ├── validation.ts         # Zod schemas + transformation
    └── courseUtils.ts        # Pure functions + utilities
```

### **🚀 Key Features Implemented**

**Dynamic Calendar System:**
- **Configuration-Driven Layout**: User-toggleable info density with mathematical scaling
- **Reference-Based Sizing**: 45-minute class = reference → dynamic hour height calculation
- **Synchronized Conflict Zones**: Perfect alignment between card rendering and conflict visualization

**Advanced Course Management:**
- **Smart Badge System**: Dual availability + waitlist indicators with risk-assessment coloring
- **Section Compatibility**: CUHK cohort system (A-LEC ↔ AE01-EXR) with hierarchical cascade clearing
- **TBA Course Handling**: Unscheduled events with expandable interface
- **Persistent State**: Cross-session localStorage with version migration

**Production Quality:**
- ✅ Zero TypeScript errors/warnings
- ✅ Complete type safety (no `any` types)
- ✅ Runtime validation with Zod schemas
- ✅ Clean builds ready for deployment

## Development Commands

### **Frontend**
```bash
cd web
npm install
npm run dev          # Development server
npm run build        # Production build (clean)
npm run lint         # Quality check
```

### **Data Scraping**
```bash
# Setup
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# Crash-resistant scraping (recommended)
python resilient_scraper.py     # All subjects with auto-recovery
python resilient_scraper.py --retry  # Retry failed only
```

## Current Development Priorities

### **✅ Completed Systems**
- Dynamic calendar configuration with mathematical layout scaling
- Smart dual badge system (availability + waitlist)
- Advanced section compatibility with CUHK cohort rules
- Crash-resistant scraping with JSONL recovery
- Complete type safety with clean architecture
- Persistent state management with localStorage migration
- **Smart section filtering** with context-aware hiding of irrelevant options
- **Mobile-responsive** course cards with proper touch targets and layouts
- **Fully decoupled CourseCard** with local state management for maximum maintainability
- **Legacy-free codebase** with simplified data formats and eliminated technical debt

### **✅ Latest Achievement: Visual Polish & UX Refinements (January 2025)**

**Major Visual & UX Improvements**: 
1. **Selection Ring Visibility Fix**: Replaced problematic blue rings with diagonal stripe patterns that work on all background colors
2. **Shopping Cart Color Indicators**: Added course-colored left borders with proper margin compensation
3. **Conflict Indication Enhancement**: Moved from border-based to background-based conflict warnings for better visibility
4. **Invalid Course Display Polish**: Improved layout with proper alignment of alert triangles, reasons, and timestamps
5. **Component Decoupling Success**: Achieved fully self-contained CourseCard with local state management

**1. Selection Pattern System**
```typescript
// Problem: Blue selection rings invisible on blue course cards
// Solution: Universal diagonal stripe patterns that work on all backgrounds

// ✅ WeeklyCalendar.tsx: Applied to 3 locations
style={{
  ...(isSelected && {
    backgroundImage: `repeating-linear-gradient(
      45deg,
      transparent,
      transparent 8px,
      rgba(255,255,255,0.15) 8px,
      rgba(255,255,255,0.15) 10px
    )`
  })
}}
```

**2. Shopping Cart Visual Enhancement**
```typescript
// ✅ Course-colored left borders with conflict background indication
className={`
  border rounded p-2 transition-all duration-300 relative
  border-l-4 border-gray-200
  ${isInvalid 
    ? 'bg-orange-50 opacity-75' 
    : hasConflict 
      ? 'bg-red-50' 
      : 'bg-white'
  }
`}
style={{
  ...(isInvalid ? {
    borderLeftColor: '#fb923c' // orange-400 for invalid courses
  } : enrollment.color ? {
    borderLeftColor: getComputedBorderColor(enrollment.color)
  } : {})
}}
```

**3. Invalid Course UX Pattern**
```typescript
// ✅ Dual-layer invalid indication for better UX
// Header: Quick visual indicator + hover tooltip
{isInvalid && (
  <div title={enrollment.invalidReason || 'Course data is outdated'}>
    <AlertTriangle className="w-3 h-3 text-orange-500" />
  </div>
)}

// Content: Full details with proper layout
<div className="flex items-center gap-2 text-xs text-orange-600">
  <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0" />
  <span>{enrollment.invalidReason}</span>
</div>
{enrollment.lastSynced && (
  <div className="text-xs text-gray-500 mt-2">Last synced:</div>
)}
{enrollment.lastSynced && (
  <div className="text-xs text-gray-500">{enrollment.lastSynced.toLocaleString()}</div>
)}
```

### **✅ Previous Achievement: Smart Section Filtering & Component Decoupling**

**Major UX & Architecture Improvements**: 
1. **Smart Section Filtering**: Hide irrelevant sections to reduce cognitive load
2. **Mobile Responsiveness**: Complete mobile-friendly experience with touch targets
3. **Component Decoupling**: Eliminated complex global state for maximum maintainability
4. **Legacy Code Elimination**: Removed technical debt for cleaner, simpler codebase

**1. Smart Section Filtering System**
```typescript
// Problem: CUHK courses have 15+ sections, overwhelming users with irrelevant choices
// Solution: Context-aware filtering with user control

// ✅ STEP 1: Hide same-type alternatives when selected
if (selectedSectionId) {
  return section.id === selectedSectionId // Show only selected A-LEC01, hide A-LEC02, A-LEC03
}

// ✅ STEP 2: Hide incompatible cross-type sections  
const isIncompatible = incompatible.includes(section)
if (isIncompatible) {
  return false // Hide B-cohort sections when A-LEC selected
}

// ✅ STEP 3: Power user override
if (showAllSectionTypes.has(typeGroup.type)) {
  return true // "Show all LEC sections" button
}
```

**2. Fully Decoupled CourseCard Architecture**
```typescript
// ❌ BEFORE: Complex global state with side effects
const [selectedSections, setSelectedSections] = useState<Map<string, string>>(new Map())
const [sectionTypesShowingAll, setSectionTypesShowingAll] = useState<Set<string>>(new Set())
// Problem: Cross-component interference, debugging nightmares

// ✅ AFTER: Self-contained with simple callbacks
function CourseCard({ course, initialSelections, onSectionsChange }) {
  const [localSelections, setLocalSelections] = useState(initialSelections)
  const [showAllSectionTypes, setShowAllSectionTypes] = useState(new Set())
  
  // All logic uses local state - no side effects!
  const isComplete = isCourseEnrollmentComplete(course, currentTerm, localSelections)
}
```

**3. Legacy Code Elimination**
```typescript
// ❌ REMOVED: Unnecessary conversion complexity
const globalSelections = new Map<string, string>()
for (const [sectionType, sectionId] of localSelections) {
  globalSelections.set(`${courseKey}_${sectionType}`, sectionId) // Tech debt!
}

// ✅ CLEAN: Simple utility functions accept local format
isCourseEnrollmentComplete(course, termName, localSelections)
// Map<sectionType, sectionId> - natural, intuitive format
```

### **✅ Previous Achievement: Critical Infrastructure Improvements**

**Problems Solved**: 
1. **Critical localStorage Bug**: Page refresh deleted all user data due to race condition
2. **Term Switch Performance**: Users experienced 47-second reload on every term change
3. **CourseSearch Maintainability**: Identified critical architecture issues for future work

**1. localStorage Race Condition Fix**
```typescript
// ❌ CRITICAL BUG: Auto-save triggered before data restoration
useEffect(() => {
  if (courseEnrollments.length === 0) {
    localStorage.removeItem(`schedule_${currentTerm}`) // Deletes data on page load!
  }
}, [courseEnrollments, currentTerm])

// ✅ SOLUTION: Hydration guard prevents premature deletion
useEffect(() => {
  if (!isHydrated) return // Wait for hydration before localStorage operations
  // ... safe save/delete logic
}, [courseEnrollments, currentTerm, isHydrated])
```

**2. Session-Based Data Caching**
```typescript
// Simple session caching to prevent term-switch reloading
const [hasDataLoaded, setHasDataLoaded] = useState(false)

useEffect(() => {
  if (hasDataLoaded) {
    console.log('📦 Course data already loaded this session, skipping reload')
    return
  }
  loadCourseData() // Only load once per session
  // eslint-disable-next-line react-hooks/exhaustive-deps -- hasDataLoaded intentionally omitted
}, [onDataUpdate])
```

**3. Enhanced Subject Discovery & Performance Tracking**
```typescript
// Dynamic subject discovery from term-specific index files
const termIndexResponse = await fetch(`/data/Index ${currentTerm}.json`)
const discoveredSubjects = termIndexData.metadata.subjects

// Real-time performance monitoring
console.log(`⚡ Performance Summary:
   Total load time: ${totalLoadTime}ms
   Total data size: ${totalDataSize}KB  
   Per-subject breakdown: CSCI: 890ms, 4521KB`)
```

**Key Architecture Insights:**
- **Critical Data Safety**: localStorage operations must respect React hydration cycle
- **Session Performance**: Simple boolean flag eliminates unnecessary reloads (47s → 0s on term switch)
- **Engineering Pragmatism**: "Dump everything" to localStorage is often the most maintainable approach
- **Impact over Perfection**: Focus on real production issues before theoretical optimizations

**Latest Architectural Insights (Visual Polish Work):**
- **Visual Accessibility**: Selection indicators must work on all background colors - universal patterns > color-dependent rings
- **Mutually Exclusive CSS Classes**: Avoid Tailwind class conflicts by using conditional logic instead of layering classes
- **Dual-Layer UX Patterns**: Quick indicators (header) + detailed information (content) provide optimal user experience
- **Color System Integration**: Consistent color mapping between components improves user mental model
- **Layout Hierarchy**: Proper spacing and alignment communicate information priority effectively

**Previous Architectural Insights:**
- **Avoid Side Effects**: Local actions should have local effects - global state creates debugging nightmares
- **Eliminate Legacy Code**: Tech debt accumulates fast - remove it immediately for maintainability
- **User Context Matters**: Smart filtering based on user actions reduces cognitive load dramatically
- **Component Decoupling**: Self-contained components with callbacks > complex shared state
- **Simple Data Formats**: `Map<sectionType, sectionId>` > `Map<"courseKey_sectionType", sectionId>`

### **✅ Previous Achievement: Hybrid Data Synchronization System**

**Problem Solved**: Stale data in shopping cart (missing `class_attributes`, outdated availability)
**Solution**: Hybrid localStorage + background sync architecture

**Critical Debugging Insights (January 2025):**
```typescript
// ❌ PROBLEMATIC: Circular dependency causes infinite loops
const handleDataUpdate = useCallback(..., [courseEnrollments, currentTerm])
// handleDataUpdate modifies courseEnrollments → re-triggers callback → infinite loop

// ✅ SOLUTION: Use state updater function, remove circular dependency  
const handleDataUpdate = useCallback(..., [currentTerm, lastSyncTimestamp])
setCourseEnrollments(current => { /* access without dependency */ })

// ✅ DUPLICATE SYNC PREVENTION: Add timestamp checking
if (Math.abs(timestamp.getTime() - lastSyncTimestamp.getTime()) < 1000) {
  return current // Skip rapid duplicates
}
```

### **🔧 Current Technical Priorities & Next Steps**

**Priority 1: Performance Optimization (Critical)**
- **Current Issue**: Initial 47-second load time (202 subjects, 32-45MB) - Only affects first page load
- **Status**: Term switching now instant (session caching implemented)
- **Next Step**: Index-based lazy loading for faster initial experience

**Planned Solution Strategy**: 
```typescript
// Phase 1: Load lightweight term index (~1.5MB, 2-3 seconds)
const indexData = await fetch(`/data/Index ${currentTerm}.json`)
// Show searchable course cards immediately with basic info

// Phase 2: Load full subject data on-demand when cards expand
const loadSubjectOnDemand = async (subject: string) => {
  if (!isSubjectLoaded(subject)) {
    const subjectData = await fetch(`/data/${subject}.json`)
    // Show full section details, availability, etc.
  }
}
```

**Architecture Approach**: Simple utility functions over complex hooks for maintainability

**Priority 2: CourseSearch Component Refactoring ✅ COMPLETED**  
**Issues Successfully Resolved:**
- ✅ **Component Decoupling**: CourseCard now fully self-contained with local state
- ✅ **Smart Section Filtering**: Context-aware filtering reduces cognitive load
- ✅ **Mobile Responsiveness**: Complete touch-friendly mobile experience  
- ✅ **Legacy Code Removal**: Eliminated complex global state and conversion logic
- ✅ **Maintainability**: Clean architecture with no side effects between components

**Current Status**: CourseCard is now enterprise-ready with excellent maintainability

**Priority 3: Shopping Cart Section Cycling Enhancement**
- Orphan section cycling doesn't reveal newly compatible types (F-LEC → A-LEC compatibility display)
- Need full availability display instead of selectedSections-only approach

**Priority 4: Advanced Features**
- URL state encoding for shareable schedules with compressed data
- Mobile touch interactions and responsive calendar scaling

## Core Implementation Details

### **Architecture Principles**
- **Boundary Isolation**: All `any` types confined to `validation.ts`
- **Type Transformation**: External snake_case → Internal camelCase at boundary
- **Runtime Safety**: Zod validates all external data with detailed errors
- **Component Consistency**: React components use internal types exclusively

### **Critical Systems**

**Dynamic Calendar Configuration:**
```typescript
// Mathematical layout engine
const calculateReferenceCardHeight = (config) => {
  let height = ROW_HEIGHTS.TITLE // 14px base
  if (config.showTime) height += ROW_HEIGHTS.TIME        // +12px
  if (config.showLocation) height += ROW_HEIGHTS.LOCATION // +11px  
  if (config.showInstructor) height += ROW_HEIGHTS.INSTRUCTOR // +10px
  return height + (CARD_PADDING * 2) // +8px padding
}

const dynamicHourHeight = referenceCardHeight / (45/60) // 45min reference
```

**Section Compatibility Engine:**
```typescript
// CUHK cohort system: A-LEC pairs with AE01-EXR, AT01-TUT (same A-cohort)
// --LEC, -E01-EXR are universal wildcards (compatible with any cohort)
// Hierarchical priority: LEC → EXR → TUT → LAB (data-driven from JSON)
// Cascade clearing: A-LEC → B-LEC auto-clears incompatible AE01-EXR
```

**Smart Badge System:**
```typescript
// Dual badge logic: [👥 Availability] + [⏰ Waitlist] (conditional)
// Risk assessment: Green (safe) → Yellow (risky) → Red (dangerous)
// Context-aware display: Only show waitlist when relevant (>0 or closed+capacity)
```

### **Data Flow Architecture**

**Scraping → Frontend Pipeline:**
```python
# 1. Crash-resistant scraper
Subject → Per-Course JSONL → Structured JSON → Frontend consumption
CSCI → CSCI_temp.jsonl → CSCI.json → CourseSearch.tsx load
```

**Hybrid Sync Data Flow:**
```typescript
// 2. Fast Display + Background Sync (January 2025 Implementation)
App Load → localStorage restore → Instant display (even if stale)
         ↓
JSON Load → Background sync → Fresh data merge → Updated UI
         ↓
Invalid courses → Orange styling + graceful degradation

// Implementation Pattern:
const handleDataUpdate = (timestamp: Date, freshCourses: InternalCourse[]) => {
  setCourseEnrollments(current => {
    // Sync current localStorage data with fresh JSON
    return current.map(enrollment => ({
      ...enrollment,
      course: findFreshCourse(enrollment.courseId),     // Fresh data
      selectedSections: updateWithFreshSections(...),  // Fresh availability
      isInvalid: !courseExists,                        // Mark invalid
      lastSynced: timestamp                            // Track sync
    }))
  })
}
```

**State Management:**
```typescript
// 3. Persistent user state with sync status
Course selections → CourseEnrollment[] → localStorage → Cross-session restore
Section choices → Map<string,string> → Term-aware storage → Migration handling
Sync status → isInvalid + lastSynced → Visual indicators → User awareness
```

## Known Issues & Limitations

**Shopping Cart Architecture:**
- Limited section cycling for orphan sections (F-LEC → A-LEC doesn't show newly compatible types)
- Shopping cart displays selectedSections only, not full section type availability

**Data Loading & Performance:**
- Loads all 13 subjects on startup instead of on-demand (AIST, CENG, CSCI, ENGG, FINA, PHYS, UGCP, UGEA, UGEB, UGEC, UGED, UGFH, UGFN)
- No lazy loading or progressive enhancement for large datasets
- No ETag-based caching for reduced bandwidth

**Real-time Limitations:**
- No live enrollment number updates during active sessions
- Background sync only occurs on app startup/refresh

## Development Standards

**Quality Gates:**
- `npm run build` must pass with zero errors/warnings
- No `any` types outside `validation.ts` boundary
- All external data must pass Zod schema validation
- React components must use internal types only

**File Organization:**
- `validation.ts`: External data handling + transformation (only file with `any`)
- `types.ts`: Clean internal domain models
- `courseUtils.ts`: Pure functions using internal types
- Components: Internal types exclusively

## ✅ Latest Achievement: Scraper Infrastructure Modernization (August 2025)

**Major Scraper Improvements & Architecture Cleanup**: 
1. **Timezone-Aware Timestamps**: All timestamps now use UTC with timezone information for international users
2. **Progress Tracking Optimization**: Simplified session-based progress tracking with clean separation of concerns
3. **Dead Code Elimination**: Removed unused index file generation and streamlined core scraper functionality
4. **React Portal Screenshot System**: Complete screenshot functionality with unscheduled sections and clean layout

### **🌍 Timezone Infrastructure Modernization**

**Problem Solved**: Ambiguous timestamps confused international users
**Solution**: UTC-based timestamp system with automatic local conversion

```python
# Before: Ambiguous local timestamps
"last_scraped": "2025-08-12T02:13:03.992733"  # What timezone?

# After: Clear UTC timestamps with timezone info
"last_scraped": "2025-08-13T05:21:32.257086+00:00"  # Clearly UTC

# Frontend automatically converts to user's timezone:
lastDataUpdate.toLocaleString()
// Los Angeles: "8/12/2025, 10:21:32 PM"
// London: "8/13/2025, 6:21:32 AM"  
// Hong Kong: "8/13/2025, 1:21:32 PM"
```

**Implementation Details:**
- ✅ **UTC Utility Function**: `utc_now_iso()` for consistent timestamp generation
- ✅ **Automatic Frontend Conversion**: JavaScript `toLocaleString()` handles timezone display
- ✅ **Backward Compatibility**: Seamless upgrade from naive timestamps
- ✅ **International UX**: Clear context for users worldwide

### **📊 Progress Tracking Architecture Cleanup**

**Problem Solved**: Confusing `created_at` vs session start, overly complex progress loading
**Solution**: Clean session-based tracking with preserved subject data

```python
# Before: Confusing historical timestamps
"created_at": "2025-07-29T19:02:27.927695",     # When was this created?
"last_updated": "2025-08-13T05:25:41.366178+00:00"

# After: Clear session tracking
"started_at": "2025-08-13T06:02:23.348263+00:00",    # THIS session start
"last_updated": "2025-08-13T06:02:23.348388+00:00"   # Latest activity
```

**Key Architecture Principles:**
- ✅ **Session Focus**: Track current scraping session, not historical file creation
- ✅ **Subject Preservation**: Keep existing subject data for subjects not being scraped
- ✅ **Fresh Session Logic**: Each new scraping run gets fresh `started_at`
- ✅ **Simplified Loading**: No unnecessary resume logic in core scraper

### **🧹 Code Cleanup & Maintainability**

**Removed Dead Code:**
- ✅ **Index File Generation**: 61 lines of unused code + 4 scattered calls eliminated
- ✅ **Legacy Timestamp Fields**: `created_at` automatically converted/removed
- ✅ **Documentation Updates**: Removed outdated references

**Architectural Insights Gained:**
- **Keep Core Focused**: Scraper should scrape, orchestration logic belongs in external scripts
- **File-Level Safety**: Per-subject JSON files provide natural protection against data loss
- **Session vs Historical**: Clear separation between current session tracking and historical data
- **Maintainable Simplicity**: Sometimes the simplest approach is the most maintainable

### **📸 React Portal Screenshot System**

**Complete Screenshot Infrastructure:**
- ✅ **React Portal Approach**: Clean overlay without affecting main layout
- ✅ **Complete Schedule Capture**: Calendar + unscheduled sections in one image
- ✅ **Interactive Display Controls**: Live toggle of time/location/instructor/title visibility
- ✅ **Clean Layout**: Professional header, proper spacing, website attribution

**Technical Implementation:**
```typescript
// Clean portal-based approach avoiding DOM cloning issues
<Portal>
  <ScreenshotOverlay 
    events={events}
    unscheduledSections={unscheduledSections}
    displayConfig={localDisplayConfig}
    onClose={() => setShowScreenshotOverlay(false)}
  />
</Portal>
```

## Current System Status (August 2025)

### **🏗️ Production Infrastructure Status**

**Scraper System: ENTERPRISE-GRADE**
- ✅ **Timezone-Aware**: UTC timestamps with international user support
- ✅ **Session-Based Progress**: Clean current session tracking
- ✅ **Crash-Resistant**: JSONL recovery with per-subject file protection
- ✅ **Maintainable Architecture**: Dead code eliminated, focused responsibilities

**Frontend System: PRODUCTION-READY** 
- ✅ **Complete Screenshot System**: React Portal with interactive controls
- ✅ **Visual Polish**: Universal selection patterns, course-colored indicators
- ✅ **Component Architecture**: Fully decoupled, self-contained components
- ✅ **Type Safety**: Zero `any` types, complete runtime validation

**Key Architecture Evolution:**
```
August 2025: Clean Separation of Concerns
├── Core Scraper: Pure scraping functionality
├── External Scripts: Orchestration & retry logic  
├── Progress Tracking: Session-focused, subject-preserving
└── Frontend: Portal-based features, timezone-aware display
```

---

*Last updated: August 2025 - Latest achievement: Scraper Infrastructure Modernization completed. Implemented timezone-aware timestamps for international users, simplified progress tracking with session focus, eliminated dead code for better maintainability, and built complete React Portal screenshot system. The project now demonstrates clean architectural separation: core scraper handles scraping, external scripts handle orchestration, and frontend provides polished user experience with modern screenshot capabilities.*