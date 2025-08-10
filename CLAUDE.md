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

### **✅ Latest Achievement: Hybrid Data Synchronization System**

**Problem Solved**: Stale data in shopping cart (missing `class_attributes`, outdated availability)
**Solution**: Hybrid localStorage + background sync architecture

**Implementation Details:**
```typescript
// Data Flow: Fast Display + Background Sync
1. App loads → localStorage display (instant UX)
2. JSON loads → Background sync process  
3. Fresh data → Update enrollments automatically
4. Invalid data → Graceful degradation with visual indicators

// Smart Sync Logic
setCourseEnrollments(currentEnrollments => {
  // Prevent infinite loops with callback form
  // Match localStorage courses with fresh JSON data
  // Update classAttributes, availability, etc.
  // Mark missing courses as invalid
})

// Invalid State Handling
interface CourseEnrollment {
  isInvalid?: boolean           // Course/sections no longer exist
  invalidReason?: string        // User-friendly explanation
  lastSynced?: Date            // Sync timestamp tracking
}
```

**Key Architecture Insights:**
- **Infinite Loop Prevention**: Use state updater callbacks, remove circular dependencies
- **Performance**: Instant display from localStorage, sync in background
- **User Experience**: Orange styling for invalid data, no intrusive popups  
- **Data Consistency**: Fresh JSON always wins, localStorage for speed only

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

### **🔧 Remaining Technical Debt & Next Steps**

**Priority 1: Shopping Cart Section Cycling Enhancement**
- Orphan section cycling doesn't reveal newly compatible types (F-LEC → A-LEC compatibility display)
- Need full availability display instead of selectedSections-only approach

**Priority 2: Data Loading Optimization**  
- Subject-on-demand loading (currently loads all 13 subjects)
- Lazy loading architecture with ETag-based freshness validation
- Progressive enhancement for large course datasets

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