# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a CUHK Course Planner web application designed to solve the problem of outdated course data in existing planners. The project consists of two main components:

1. **Advanced Course Data Scraper** (`cuhk_scraper.py`): ✅ **PRODUCTION READY** - Comprehensive Python-based web scraper with multi-term support and detailed course information extraction.
2. **Web Interface**: 🔧 **SOLID FOUNDATION** - Next.js + Tailwind CSS frontend with functional core features and clean architectural foundation

## Current Development Status

### ✅ **Completed Core Features**
- **Course Search**: Real-time search across 4 subjects (CSCI, AIST, PHYS, FINA) with performance optimization
- **Shopping Cart System**: Add/remove courses with visibility toggles and conflict indicators
- **Calendar Visualization**: Weekly schedule display with color-coded courses and conflict zones
- **Dynamic Conflict Detection**: Visual red zones for overlapping course times (only applies to visible courses)
- **Responsive Layout**: 3/4 calendar + 1/4 shopping cart layout with full-width search

### ✅ **Architectural Refactoring Complete** (August 2025)
- **Unified Data Models**: Single `Course` interface across all components
- **Centralized Utilities**: Shared conflict detection and data transformation logic
- **Type Safety**: Full TypeScript coverage with proper interfaces
- **Code Deduplication**: Eliminated 100+ lines of duplicate conflict detection logic

### 🚧 **Remaining Issues Requiring Resolution**

#### **1. Layout & UX Problems** (Medium Priority)
- **Shopping cart overflow**: When cart gets long, search box pushed to bottom - unusable
- **Fixed height conflicts**: Calendar and cart need responsive height management  
- **Mobile responsiveness**: Layout breaks on smaller screens
- **Unused code cleanup**: WeeklyCalendar has unused helper functions

#### **2. Shopping Cart UX Issues** (Medium Priority)
- **No section alternatives**: Users can't cycle through different sections/times for same course
- **Limited course management**: Can't edit selected section after adding
- **Conflict resolution UX**: No clear path to resolve conflicts beyond hide/show

#### **3. Technical Polish** (Low Priority)
- **Webpage title**: Still shows default "Create Next App"
- **URL state management**: Schedules not shareable via URL
- **Deployment strategy**: Need production hosting plan

## Current Architecture (Post-Refactoring)

### **Frontend Structure** ✅ **IMPROVED**
```
web/
├── src/
│   ├── app/
│   │   └── page.tsx                    # Main application (✅ CLEAN - uses utilities)
│   ├── components/
│   │   ├── CourseSearch.tsx           # Search with add buttons (✅ CLEAN)
│   │   ├── WeeklyCalendar.tsx         # Calendar display (⚠️ HAS UNUSED CODE)
│   │   └── ShoppingCart.tsx           # Course management (✅ CLEAN)
│   └── lib/
│       └── courseUtils.ts             # ✅ SHARED UTILITIES - Single source of truth
```

### **Architectural Achievements**

#### **1. Unified Data Models** ✅
```typescript
// Single Course interface used everywhere
interface Course {
  id: string
  subject: string
  courseCode: string
  title: string
  section: string
  time: string
  location: string
  instructor: string
  credits: string
  color: string
  isVisible: boolean
  hasConflict: boolean
}

// Clean data transformation pipeline
ScrapedCourse → transformScrapedCourse() → Course → coursesToCalendarEvents() → CalendarEvent
```

#### **2. Centralized Conflict Detection** ✅
```typescript
// lib/courseUtils.ts - Single source of truth
export function detectConflicts(courses: Course[]): Course[]
export function parseTimeRange(timeStr: string): TimeRange | null  
export function doTimesOverlap(time1: TimeRange, time2: TimeRange): boolean
export function getConflictZones(events: CalendarEvent[]): ConflictZone[]
export function groupOverlappingEvents(events: CalendarEvent[]): CalendarEvent[][]
```

#### **3. Clean Component Architecture** ✅
- **page.tsx**: Reduced from 335 to ~100 lines, uses utility functions
- **No duplicate logic**: All conflict detection uses shared utilities
- **Type safety**: Zero `any` types, proper TypeScript interfaces
- **Pure functions**: All utilities are testable and side-effect free

## Architectural Lessons Learned

### **✅ What Worked Well**
1. **Utility Functions Over Classes**: 
   - React functional components work better with pure utility functions
   - Easier testing, better tree-shaking, no state management overhead
   - Our conflict detection is fast enough (<1ms) - no caching needed

2. **Incremental Refactoring**:
   - Extracted utilities first, then refactored components
   - Maintained functionality throughout the process
   - Build verification at each step prevented regressions

3. **TypeScript-First Approach**:
   - Unified interfaces eliminated data transformation bugs
   - Caught type mismatches early in development
   - Improved developer experience with IntelliSense

### **🔍 Critical Design Decisions**

#### **Why Utilities Over Centralized Class/State Management?**

**Utilities Chosen Because:**
- Simple state (one array with boolean flags)
- Fast computations (conflict detection < 1ms for 20 courses)  
- React functional patterns (hooks work well with pure functions)
- No complex state interactions or deep nesting
- Easy to test and reason about

**When to Consider State Management:**
- If we add undo/redo functionality
- Complex section alternatives with preview states
- Real-time collaboration features
- Performance becomes an issue (>100 courses)

#### **Data Flow Architecture**

**Before Refactoring** ❌
```
Component A: parseTime() + detectConflicts() + eventsOverlap()
Component B: parseTimeRange() + coursesOverlap() + getConflictZones()  
Component C: Custom conflict logic + display logic
```

**After Refactoring** ✅  
```
courseUtils.ts: Single source of truth for all utilities
       ↓
All Components: Import only what they need
       ↓
Consistent behavior, easy maintenance, testable logic
```

## Development Commands

### **Frontend Development**
```bash
cd web
npm install
npm run dev          # Development server
npm run build        # Production build (✅ Zero TypeScript errors)
npm run lint         # Code quality check
```

### **Scraper (Production Ready)**
```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python cuhk_scraper.py
```

## Next Development Priorities

### **Phase 1: UX Polish** (Current Focus)
1. **Layout responsiveness**: Fix shopping cart overflow, mobile layout
2. **Code cleanup**: Remove unused functions in WeeklyCalendar
3. **Section alternatives**: Allow users to cycle through different sections
4. **Conflict resolution UX**: Clear visual workflow for resolving conflicts

### **Phase 2: Feature Enhancement**
1. **URL state management**: Shareable schedule links
2. **Advanced filtering**: Search by time slots, prerequisites, instructors
3. **Schedule optimization**: Auto-suggest conflict-free combinations
4. **Export functionality**: PDF/iCal export for schedules

### **Phase 3: Scale & Polish**
1. **Performance optimization**: Handle all 263 subjects efficiently
2. **Advanced search**: Full-text search, fuzzy matching
3. **User preferences**: Save favorite schedules, default settings
4. **Progressive Web App**: Offline functionality, mobile app experience

## Technical Insights for Future Development

### **Current Strengths** ✅
- **Clean architecture**: Shared utilities, unified data models, type safety
- **Real-time search**: useMemo optimization handles 4 subjects smoothly
- **Visual feedback**: Effective conflict zones and warning indicators
- **Data pipeline**: Scraper → JSON → Frontend works reliably
- **Development workflow**: Zero-error builds, clear component boundaries

### **Scalability Considerations**
- **Current approach**: Works well for 4 subjects (~50 courses)
- **Scaling to 263 subjects**: May need virtualization, lazy loading, search indexing
- **Performance bottlenecks**: Search filtering, conflict detection on large datasets
- **Memory management**: Consider pagination or windowing for large course lists

### **Key Files & Locations**
- **Main App**: `web/src/app/page.tsx` (✅ REFACTORED - clean utility usage)
- **Shared Logic**: `web/src/lib/courseUtils.ts` (✅ NEW - single source of truth)
- **Components**: `web/src/components/` (✅ CLEAN - using shared types)
- **Course Data**: `web/public/data/*.json` (4 subjects currently loaded)
- **Scraper**: `cuhk_scraper.py` (production ready, generates JSON data)

## Data Flow & Integration

### **Current Data Pipeline** ✅
```
CUHK Website → Python Scraper → JSON Files → Next.js Frontend
                                    ↓
            Real-time Search ← Static File Loading ← Progressive Loading
```

### **Frontend Data Flow** ✅ **REFACTORED**
```
JSON Load → CourseSearch → transformScrapedCourse() → Shopping Cart State
                                    ↓
                          coursesToCalendarEvents()
                                    ↓
                          Calendar Visualization
                                    ↓  
                          detectConflicts() (Single Source) ✅
```

### **Conflict Detection Flow** ✅
```
User Action (add/remove/toggle) → detectConflicts(courses) → Updated Course States
                                           ↓
Components Re-render → getConflictZones() → Visual Red Zones
                                           ↓
Shopping Cart → Display Conflict Count → User Feedback
```

## Future Iteration Guidelines

### **When Adding New Features**
1. **Check courseUtils.ts first**: See if needed functionality already exists
2. **Add new utilities**: Don't duplicate logic in components
3. **Update interfaces**: Extend `Course` or `CalendarEvent` if needed
4. **Test with build**: Ensure zero TypeScript errors before committing

### **When Refactoring Components**
1. **Extract shared logic**: Move reusable code to courseUtils.ts
2. **Use existing types**: Import from courseUtils instead of creating new interfaces  
3. **Keep components lean**: Business logic should live in utilities
4. **Verify functionality**: Test all user workflows after changes

### **Performance Optimization Strategy**
1. **Measure first**: Use React DevTools to identify bottlenecks
2. **Optimize utilities**: Single functions are easier to optimize than spread logic
3. **Consider memoization**: Add useMemo/useCallback for expensive operations
4. **Profile real usage**: Test with realistic course loads

This document reflects the current state as of August 2025 after major architectural refactoring. The foundation is now solid for future feature development and scale.