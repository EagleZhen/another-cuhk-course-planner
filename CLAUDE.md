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

### **✅ Latest Achievement: Enhanced Subject Filtering & Performance Optimization**

**Problem Solved**: Subject discovery and filtering system with performance insights for 200+ subjects
**Solution**: Dynamic subject discovery + term-specific filtering + performance analysis

**Implementation Details:**
```typescript
// Subject Discovery: Dynamic probing instead of hardcoded lists
const discoveredSubjects = await Promise.all(
  potentialSubjects.map(async (subject) => {
    const response = await fetch(`/data/${subject}.json`, { method: 'HEAD' })
    return response.ok ? subject : null
  })
)

// Term-Specific Filtering: Persistent during session
const [subjectFiltersByTerm, setSubjectFiltersByTerm] = useState<Map<string, Set<string>>>(new Map())

// Performance Tracking: Real-time loading metrics
console.log(`⚡ Performance Summary:
   Total load time: ${totalLoadTime}ms
   Total data size: ${totalDataSize}KB  
   Per-subject breakdown: CSCI: 890ms, 4521KB`)
```

**Key Architecture Insights:**
- **Subject Discovery**: Parallel HEAD requests discover available subjects (202 found vs 13 hardcoded)
- **Term Isolation**: Each term maintains separate subject filters during session
- **Performance Reality**: 47 seconds for 202 subjects on 4G → Need hybrid loading strategy
- **UI Consistency**: Subject toggles use same Button styling as other controls

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
- **Current Issue**: 47 seconds to load 202 subjects (32-45MB total data) on 4G
- **Solution Strategy**: Hybrid term index + on-demand subject loading
- **Implementation**: 
  ```typescript
  // Phase 1: Load term index (~1.5MB, 2-3 seconds)
  const termIndex = await fetch(`/data/Index ${currentTerm}.json`)
  // Phase 2: Load subjects on-demand when user expands course cards
  const loadSubjectOnDemand = async (subject: string) => {
    if (!loadedSubjects.has(subject)) {
      await fetch(`/data/${subject}.json`) // 1-3MB per subject
    }
  }
  ```

**Priority 2: Shopping Cart Section Cycling Enhancement**
- Orphan section cycling doesn't reveal newly compatible types (F-LEC → A-LEC compatibility display)
- Need full availability display instead of selectedSections-only approach

**Priority 3: Advanced Features**
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

---

*Last updated: January 2025 - Reflects current enterprise-grade system with dynamic calendar, hybrid data synchronization, section compatibility, and complete type safety. Includes critical debugging insights for infinite loop prevention. Ready for production deployment and future enhancements.*