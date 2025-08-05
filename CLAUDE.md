# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a CUHK Course Planner web application designed to solve the problem of outdated course data in existing planners. The project consists of two main components:

1. **Advanced Course Data Scraper** (`cuhk_scraper.py`): ✅ **PRODUCTION READY** - Comprehensive Python-based web scraper with multi-term support and detailed course information extraction.
2. **Web Interface**: 🔧 **IN DEVELOPMENT** - Next.js + Tailwind CSS frontend with functional core features but requiring architectural improvements

## Current Development Status

### ✅ **Completed Core Features**
- **Course Search**: Real-time search across 4 subjects (CSCI, AIST, PHYS, FINA) with performance optimization
- **Shopping Cart System**: Add/remove courses with visibility toggles and conflict indicators
- **Calendar Visualization**: Weekly schedule display with color-coded courses and conflict zones
- **Basic Conflict Detection**: Visual red zones for overlapping course times
- **Responsive Layout**: 3/4 calendar + 1/4 shopping cart layout with full-width search

### 🚧 **Critical Issues Requiring Resolution**

#### **1. Layout & UX Problems** (High Priority)
- **Shopping cart overflow**: When cart gets long, search box pushed to bottom - unusable
- **Fixed height conflicts**: Calendar and cart need responsive height management
- **Mobile responsiveness**: Layout breaks on smaller screens

#### **2. Architectural Debt** (High Priority)
- **Duplicated conflict logic**: Conflict detection scattered across multiple components
- **State management complexity**: Course state, visibility, and conflicts tightly coupled
- **No centralized data layer**: Each component manages its own course data transformations

#### **3. Shopping Cart UX Issues** (High Priority)
- **No section alternatives**: Users can't cycle through different sections/times for same course
- **Limited course management**: Can't edit selected section after adding
- **Conflict resolution UX**: No clear path to resolve conflicts beyond hide/show

## Current Architecture Analysis

### **Frontend Structure**
```
web/
├── src/
│   ├── app/
│   │   └── page.tsx                    # Main application (⚠️ MONOLITHIC - 300+ lines)
│   ├── components/
│   │   ├── CourseSearch.tsx           # Search with add buttons (✅ CLEAN)
│   │   ├── WeeklyCalendar.tsx         # Calendar display (⚠️ COMPLEX CONFLICT LOGIC)
│   │   └── ShoppingCart.tsx           # Course management (✅ FUNCTIONAL)
│   └── lib/                           # ❌ MISSING - No shared utilities
```

### **Key Technical Debt**

#### **1. Monolithic Main Component** (page.tsx - 300+ lines)
- **Conflict detection logic**: Duplicated in multiple places
- **Time parsing functions**: Repeated with slight variations  
- **State management**: Complex interdependent useState calls
- **Event handlers**: Tightly coupled with component state

#### **2. Inconsistent Data Structures**
```typescript
// Course data from JSON (scraper format)
{ subject: "CSCI", course_code: "3100", terms: [...] }

// Shopping cart format (component format)  
{ subject: "CSCI", courseCode: "3100", time: "Mo 14:30 - 15:15" }

// Calendar events format (calendar format)
{ courseCode: "CSCI3100", day: 0, startHour: 14 }
```

#### **3. Scattered Conflict Detection**
- **page.tsx**: `detectConflicts()` function for shopping cart
- **WeeklyCalendar.tsx**: `eventsOverlap()` function for visual zones
- **ShoppingCart.tsx**: Conflict display logic
- **No single source of truth** for what constitutes a conflict

## Proposed Architectural Improvements

### **Priority 1: Centralized State & Logic** 🔥
```typescript
// lib/courseStore.ts - Centralized state management
interface CourseStore {
  selectedCourses: Course[]
  visibleCourses: Course[]
  conflicts: ConflictGroup[]
  
  addCourse: (course: Course, section?: Section) => void
  removeCourse: (courseId: string) => void
  toggleVisibility: (courseId: string) => void
  switchSection: (courseId: string, sectionId: string) => void
}

// lib/conflictEngine.ts - Single conflict detection system
class ConflictEngine {
  detectConflicts(courses: Course[]): ConflictGroup[]
  resolveConflicts(courses: Course[]): Resolution[]
  suggestAlternatives(conflicted: Course[]): Alternative[]
}
```

### **Priority 2: Responsive Layout System** 📱
```typescript
// Replace fixed layout with responsive containers
<ResizableLayout>
  <CalendarPanel flex={3} minHeight="600px" />
  <ShoppingCartPanel flex={1} maxHeight="calc(100vh - 200px)" />
  <SearchPanel position="bottom" expandable />
</ResizableLayout>
```

### **Priority 3: Enhanced Shopping Cart UX** 🛒
```typescript
interface EnhancedShoppingCart {
  // Section switching within same course
  switchSection: (courseId: string, newSection: Section) => void
  
  // Alternative recommendations
  getAlternatives: (courseId: string) => Alternative[]
  
  // Conflict resolution workflows
  resolveConflicts: (strategy: 'auto' | 'manual' | 'suggest') => void
}
```

## Development Commands

### **Frontend Development**
```bash
cd web
npm install
npm run dev          # Development server
npm run build        # Production build
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

### **Phase 1: Fix Critical UX Issues** (Current Focus)
1. **Responsive layout**: Fix shopping cart overflow and mobile layout
2. **Section alternatives**: Allow users to cycle through different sections
3. **Conflict resolution UX**: Clear visual workflow for resolving scheduling conflicts

### **Phase 2: Architectural Refactoring** 
1. **Extract shared logic**: Create lib/courseUtils.ts for common functions
2. **Centralize state**: Implement CourseStore with proper state management
3. **Unified data models**: Single Course interface across all components

### **Phase 3: Advanced Features**
1. **Auto-conflict resolution**: Smart suggestions for conflict-free schedules
2. **URL state management**: Shareable schedule links
3. **Enhanced filtering**: Advanced search and filtering capabilities

## Technical Insights for Future Development

### **Current Strengths**
- ✅ **Real-time search performance**: useMemo optimization works well
- ✅ **Visual conflict zones**: Effective user feedback for scheduling issues
- ✅ **Component modularity**: Clean separation between search, calendar, cart
- ✅ **Data integration**: Scraper → JSON → Frontend pipeline works smoothly

### **Architecture Lessons Learned**
- ⚠️ **Avoid monolithic components**: Split page.tsx into smaller, focused components
- ⚠️ **Centralize business logic**: Conflict detection should be a shared service
- ⚠️ **Plan for data consistency**: Unified models prevent transformation bugs
- ⚠️ **Design for scalability**: Current approach won't handle 263 subjects efficiently

### **Key Files & Locations**
- **Main App**: `web/src/app/page.tsx` (needs refactoring)
- **Course Data**: `web/public/data/*.json` (4 subjects currently loaded)
- **Components**: `web/src/components/` (search, calendar, cart)
- **Scraper**: `cuhk_scraper.py` (production ready, generates JSON data)

## Data Flow & Integration

### **Current Data Pipeline** ✅
```
CUHK Website → Python Scraper → JSON Files → Next.js Frontend
                                    ↓
            Real-time Search ← Static File Loading ← Progressive Loading
```

### **Frontend Data Flow** (Needs Refactoring)
```
JSON Load → CourseSearch → Add Button → Shopping Cart State
                                           ↓
                               Calendar Visualization
                                           ↓  
                               Conflict Detection (Multiple Places) ⚠️
```

This document reflects current state as of August 2025. The core functionality works but requires architectural improvements for maintainability and user experience.