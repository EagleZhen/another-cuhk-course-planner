# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a CUHK Course Planner web application designed to solve the problem of outdated course data in existing planners. The project consists of two main components:

1. **Advanced Course Data Scraper** (`cuhk_scraper.py`): ✅ **PRODUCTION READY** - Comprehensive Python-based web scraper with multi-term support and detailed course information extraction.
2. **Web Interface**: 🚀 **ADVANCED FUNCTIONALITY** - Next.js + Tailwind CSS frontend with section-based course selection and comprehensive conflict management

## Current Development Status

### ✅ **Completed Core Features**
- **Real-time Course Search**: Across 4 subjects (CSCI, AIST, PHYS, FINA) with term filtering and performance optimization
- **Section-Based Selection**: Users select individual sections (LEC, TUT, LAB) with smart validation
- **Term Management**: Selectable terms with automatic filtering and shopping cart clearing
- **Advanced Shopping Cart**: Compact design with credits display, conflict indicators, and layout stability
- **Calendar Visualization**: Weekly schedule with color-coded courses, conflict zones, and smart stacking
- **Dynamic Conflict Detection**: Visual red zones for overlapping course times (only applies to visible courses)
- **Responsive Layout**: Optimized 3/4 calendar + 1/4 shopping cart with scrollable content

### ✅ **Major UX Improvements Complete** (August 2025)
- **Section Type Parsing**: Handles complex formats (`--LEC (6161)`, `-L01-LAB (8040)`, `-T01-TUT (5455)`)
- **Smart Course Addition**: Only enabled when all required section types are selected
- **Icon-Based Interactions**: `+`/`×` buttons with tooltips to save space
- **Layout Stability**: Reserved space for conflict indicators prevents UI shifts
- **Term Selector**: Dropdown in calendar header with 5 available terms
- **Search Filtering**: Clear indication that results are filtered by selected term

### ✅ **Architectural Excellence** (August 2025)
- **Unified Data Models**: Section-aware interfaces across all components
- **Centralized Utilities**: Shared conflict detection, section parsing, and data transformation
- **Type Safety**: Full TypeScript coverage with proper interfaces for complex course structures
- **Code Deduplication**: Eliminated 150+ lines of duplicate logic across components
- **Clean Build**: Zero TypeScript errors, zero ESLint warnings

### 🔧 **Current Implementation Status**

#### **Section-Based Course Selection** ✅ **PRODUCTION READY**
```typescript
// Users must select one section from each required type
📚 LECTURE (Pick 1)
○ LEC A   Mo 14:30-15:15   Prof. WONG    [+] [45/50]
○ LEC B   Tu 09:30-10:15   Prof. CHAN    [+] [23/40]

📝 TUTORIAL (Pick 1)  
○ TUT A1  We 11:30-12:15   TA: Alice     [+] [12/25]
✓ TUT A2  We 14:30-15:15   TA: Bob       [×] [18/25]  (selected)

🧪 LABORATORY (Pick 1)
○ LAB 1   Fr 14:30-17:15   Lab Tech      [+] [15/20]

[Add to Cart] (Disabled until all types selected)
```

#### **Term-Aware Course Management** ✅
- **Term Dropdown**: Calendar header with 5 selectable terms
- **Automatic Filtering**: Search results filtered by selected term
- **Shopping Cart Clearing**: Automatic cleanup when switching terms
- **Clear User Feedback**: Visual indication of term-based filtering

### 🚧 **Remaining Development Tasks**

#### **1. Shopping Cart Enhancement** (High Priority)
- **Complete Course Enrollments**: Cart should store section combinations, not individual courses
- **Section Cycling**: Allow users to change selected sections within enrolled courses
- **Enhanced Conflict Resolution**: Visual workflow for resolving scheduling conflicts

#### **2. Technical Polish** (Medium Priority)
- **Webpage Title**: Update from default "Create Next App"
- **URL State Management**: Shareable schedule links with term and selections
- **Mobile Responsiveness**: Layout optimization for smaller screens

#### **3. Advanced Features** (Future Enhancements)
- **Auto-Conflict Resolution**: Smart suggestions for conflict-free schedules
- **Schedule Export**: PDF/iCal export functionality
- **Multi-Term Support**: Separate shopping carts per term

## Current Architecture (Section-Based Implementation)

### **Frontend Structure** ✅ **SECTION-AWARE**
```
web/
├── src/
│   ├── app/
│   │   └── page.tsx                    # ✅ TERM-AWARE - manages current term state
│   ├── components/
│   │   ├── CourseSearch.tsx           # ✅ SECTION-BASED - handles section selection
│   │   ├── WeeklyCalendar.tsx         # ✅ TERM-SELECTOR - dropdown in header
│   │   └── ShoppingCart.tsx           # ✅ SPACE-OPTIMIZED - compact scrollable design
│   └── lib/
│       └── courseUtils.ts             # ✅ SECTION-PARSING - handles complex formats
```

### **Advanced Data Models** ✅

#### **1. Section-Based Course Structure**
```typescript
// Section type grouping for course selection
interface SectionTypeGroup {
  type: string           // 'LEC', 'TUT', 'LAB'  
  displayName: string    // 'Lecture', 'Tutorial', 'Laboratory'
  icon: string          // '📚', '📝', '🧪'
  sections: Section[]   // Available sections of this type
}

// Individual section with meeting details
interface Section {
  id: string
  section: string       // '--LEC (6161)', '-T01-TUT (5455)'
  meetings: Meeting[]
  availability: {
    capacity: string
    enrolled: string
    status: string
    available_seats: string
  }
}

// Complete course enrollment (combination of selected sections)
interface CourseEnrollment {
  courseId: string
  selectedSections: Map<string, Section>  // sectionType -> selected section
  isComplete: boolean                     // all required types selected
  conflicts: Conflict[]
}
```

#### **2. Advanced Section Parsing** ✅
```typescript
// Handles multiple section naming formats
export function parseSectionTypes(course: any, termName: string): SectionTypeGroup[]

// Supported formats:
// --LEC (6161)     -> LEC
// -L01-LAB (8040)  -> LAB  
// -T01-TUT (5455)  -> TUT
// LEC A            -> LEC
```

#### **3. Smart Course Validation** ✅
```typescript
// Ensures all required section types are selected before allowing addition
export function isCourseEnrollmentComplete(
  course: any, 
  termName: string, 
  selectedSections: Map<string, string>
): boolean
```

### **Key Technical Innovations**

#### **1. Complex Section Type Recognition**
- **Regex-Based Parsing**: Handles university's inconsistent section naming
- **Type Validation**: Ensures students select required components (LEC + TUT + LAB)
- **Icon Mapping**: Visual icons for different section types improve UX

#### **2. Term-Aware State Management**
- **Term Filtering**: Only shows courses available in selected term
- **State Isolation**: Separate course selections per term (prevents cross-term conflicts)
- **Automatic Cleanup**: Clears invalid selections when switching terms

#### **3. Layout Stability Engineering**
- **Reserved Space**: Always allocates space for conflict indicators
- **Fixed Button Sizes**: Icons prevent layout shifts during interactions
- **Scrollable Design**: Shopping cart handles overflow gracefully

## Development Commands

### **Frontend Development**
```bash
cd web
npm install
npm run dev          # Development server with section-based selection
npm run build        # Production build (✅ Zero TypeScript errors)
npm run lint         # Code quality check (✅ Zero warnings)
```

### **Scraper (Production Ready)**
```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python cuhk_scraper.py
```

## Next Development Priorities

### **Phase 1: Complete Section-Based Implementation** 🔥
1. **Shopping Cart Refactor**: Store complete course enrollments (section combinations)
2. **Section Cycling**: Allow users to change selected sections post-enrollment
3. **Enhanced Conflict Detection**: Account for section-level conflicts across courses
4. **Term Persistence**: Remember term selection in URL/localStorage

### **Phase 2: Advanced Course Management**
1. **Multi-Term Support**: Separate shopping carts for different terms
2. **Schedule Optimization**: Auto-suggest conflict-free section combinations
3. **Waitlist Integration**: Handle closed/waitlisted sections
4. **Prerequisite Validation**: Check course requirements before enrollment

### **Phase 3: Production Features**
1. **Export Functionality**: PDF/iCal export with section details
2. **Schedule Sharing**: URL-based schedule sharing with term and selections
3. **Performance Optimization**: Handle all 263 subjects efficiently
4. **Mobile App**: Progressive Web App with offline support

## Technical Insights for Future Development

### **Current Strengths** ✅
- **Section-Aware Architecture**: Handles university's complex course structure accurately
- **Robust Parsing**: Regex patterns handle all known section naming formats
- **Smart Validation**: Prevents invalid course enrollments before they happen
- **Term Management**: Proper isolation and filtering by academic term
- **Visual Excellence**: Clear feedback, stable layout, intuitive interactions
- **Performance**: Handles 4 subjects (50+ courses) with real-time responsiveness

### **Complex Problem Solutions**

#### **1. Section Naming Complexity**
**Problem**: University uses inconsistent section naming (`--LEC (6161)`, `-L01-LAB (8040)`)
**Solution**: Multi-pattern regex parser with fallback logic
```typescript
// Pattern 1: --TYPE or -XXX-TYPE
/-+(?:[A-Z]\d+-)?(LEC|TUT|LAB|EXR|SEM|PRJ|WKS|PRA|FLD)/

// Pattern 2: TYPE at start (fallback)
/^(LEC|TUT|LAB|EXR|SEM|PRJ|WKS|PRA|FLD)/
```

#### **2. Course Enrollment Validation**
**Problem**: Students must select compatible section combinations
**Solution**: Type-based validation with visual feedback
```typescript
// Only enable "Add to Cart" when all required types selected
const isComplete = sectionTypes.every(type => 
  selectedSections.has(`${courseKey}_${type.name}`)
)
```

#### **3. Term-Based Data Management**
**Problem**: Courses have different sections available in different terms
**Solution**: Term-aware filtering with automatic state cleanup
```typescript
// Filter courses by selected term, clear cart on term change
const termFilteredCourses = allCourses.filter(course => 
  course.terms.some(term => term.term_name === currentTerm)
)
```

### **Scalability Architecture**

#### **Current Approach** (4 subjects, ~50 courses)
- **Real-time search**: useMemo optimization handles current load
- **Section parsing**: Regex parsing performs well for current dataset
- **State management**: Simple Map-based selection tracking

#### **Scaling Strategy** (263 subjects, ~2000+ courses)
- **Search indexing**: Pre-process course data for faster search
- **Virtual scrolling**: Handle large course lists efficiently
- **Section caching**: Cache parsed section types to avoid re-computation
- **Progressive loading**: Load subjects on-demand

### **Key Files & Implementation Details**

#### **Core Implementation Files**
- **`web/src/lib/courseUtils.ts`**: ✅ Section parsing, validation, type definitions
- **`web/src/components/CourseSearch.tsx`**: ✅ Section-based selection UI
- **`web/src/components/WeeklyCalendar.tsx`**: ✅ Term selector integration
- **`web/src/components/ShoppingCart.tsx`**: ✅ Compact, stable layout
- **`web/src/app/page.tsx`**: ✅ Term state management

#### **Data Pipeline**
```
CUHK Website → Python Scraper → JSON Files → Term Filtering → Section Parsing → User Selection → Course Enrollment
```

#### **Section Selection Flow**
```
User Expands Course → Parse Section Types → Display by Type → User Selects → Validate Completeness → Enable Add
```

## Critical Implementation Notes for Future Development

### **Section Type Management**
- **Always assume all section types are required** (LEC + TUT + LAB)
- **Parse section types per term** (availability varies by term)
- **Handle unknown section types gracefully** (fallback to 'OTHER')

### **Term Management**
- **Clear shopping cart when switching terms** (prevents invalid enrollments)
- **Filter search results by selected term** (avoid showing unavailable courses)
- **Store term selection in URL for sharing** (future enhancement)

### **Conflict Detection**
- **Conflicts only apply to visible courses** (hidden courses don't conflict)
- **No intra-course conflicts** (sections within same course don't conflict)
- **Visual feedback through red zones** (background highlighting)

### **Data Consistency**
- **Use courseUtils.ts for all course operations** (single source of truth)
- **Validate section selections before enrollment** (prevent invalid states)
- **Handle missing/malformed course data gracefully** (robust error handling)

This document reflects the current state as of August 2025 after implementing advanced section-based course selection. The system now handles the complexity of university course structures while maintaining excellent user experience and code quality.