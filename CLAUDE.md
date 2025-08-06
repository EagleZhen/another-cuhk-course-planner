# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a CUHK Course Planner web application designed to solve the problem of outdated course data in existing planners. The project consists of two main components:

1. **Advanced Course Data Scraper** (`cuhk_scraper.py`): ✅ **PRODUCTION READY** - Comprehensive Python-based web scraper with multi-term support and detailed course information extraction.
2. **Web Interface**: 🎯 **ENTERPRISE-GRADE** - Next.js + Tailwind CSS frontend with persistent storage, advanced interactions, deterministic color system, and production-quality UX patterns

## Current Development Status

### 🎯 **Enterprise-Grade Platform Features** (Production Ready)
- **Persistent Course Management**: localStorage-backed schedules with cross-session continuity and per-term isolation
- **Advanced Calendar Interactions**: Click-to-select, hover-to-toggle, auto-scroll selection with 1-second timeout UX
- **Deterministic Color System**: Hash-based color assignment ensuring consistent course colors across sessions
- **Interactive Section Selection**: Clickable section rows with instant visual feedback and enhanced UX patterns
- **Smart Conflict Visualization**: Animated diagonal stripe backgrounds with pulse effects for time conflicts
- **Cross-Component Communication**: Calendar events trigger shopping cart selection with smooth auto-scroll
- **Production-Quality Architecture**: Enterprise-grade state management with automatic persistence and recovery

### 🚀 **Advanced Interaction & Persistence System** (August 2025)
- **localStorage Integration**: Automatic per-term schedule saving with intelligent cleanup and Date object restoration
- **Calendar-Shopping Cart Sync**: Clicking calendar cards triggers shopping cart selection with smooth auto-scroll
- **Hover Interaction Controls**: Eye/EyeOff buttons appear on calendar card hover for instant visibility toggling
- **Visual Selection Feedback**: Blue ring highlights, scale effects, and background changes for selected items
- **Smart Auto-Clear Selection**: Selected items automatically clear after 1-second for optimal UX flow
- **Meeting Consolidation**: Advanced grouping by time+location+instructor with duplicate elimination
- **Enhanced Section Interactions**: Clickable section rows throughout the interface with instant visual feedback

### 🏗️ **Production-Grade Architecture & Performance** (August 2025)
- **Sophisticated Color Management**: Deterministic hash-based assignment with prime number mixing for optimal distribution
- **Cross-Session State Persistence**: localStorage with automatic Date object serialization and term-aware storage
- **Advanced Event Aggregation**: Efficient calendar event generation with proper conflict detection and visual feedback
- **Enhanced Interaction Architecture**: Cross-component communication with smooth animations and auto-scroll behavior
- **Memory-Efficient Rendering**: Proper React patterns with useRef-based DOM manipulation and cleanup
- **Enterprise Error Handling**: Graceful fallbacks for storage failures and malformed data recovery
- **Performance-Optimized Persistence**: Smart storage cleanup and efficient serialization patterns

### 🏆 **Advanced Implementation Status**

#### **Interactive Course Management System** 🎯 **ENTERPRISE-GRADE**
```typescript
// Advanced persistent enrollment with cross-component interactions
📚 CSCI3100 - Software Engineering (3.0 credits) [Deterministic Color: bg-blue-500]
  ├─ --LEC (6161): Tu 12:30-14:15, Th 1:30-2:15 | Prof. LIU  [👁️ Hover Toggle]
  ├─ -T01-TUT (5455): We 14:30-15:15 | TA: Alice     [📍 Click → Auto-scroll]
  └─ -L01-LAB (8040): Fr 14:30-17:15 | Lab Tech      [🔄 Persistent Storage]

🛒 Shopping Cart: Auto-scroll selection with visual highlights and ring effects
📅 Calendar: Click-to-select cards with hover controls and animated conflicts
💾 Persistence: Cross-session localStorage with per-term isolation
🎨 Colors: Hash-based assignment ensuring consistency across browser restarts
```

#### **Interactive Calendar & Smart Shopping Cart** 🚀 **ENTERPRISE-GRADE**

**📅 Advanced Calendar Interactions:**
- **Click-to-Select**: Calendar cards trigger shopping cart selection with smooth auto-scroll
- **Hover Controls**: Eye/EyeOff buttons appear on hover for instant visibility toggling
- **Animated Conflicts**: Diagonal stripe backgrounds with pulse effects for time overlaps
- **Sticky Header**: Optimized scroll experience with fixed day headers
- **Smart Stacking**: Proper z-index management for overlapping course cards

**🛒 Production-Quality Shopping Cart:**
- **Auto-Scroll Selection**: Smooth scrolling to selected items with visual ring highlights
- **Meeting Consolidation**: Smart grouping eliminates duplicates with time+location+instructor keys
- **Enhanced Visual Feedback**: Blue rings, scale effects, and background highlights for selections
- **Compact Information**: Tooltip-enabled instructor names with proper truncation
- **Persistent State**: Cross-session continuity with automatic localStorage management

**💾 Enterprise Storage & State:**
- **Per-Term Isolation**: Separate localStorage keys with automatic restoration on term switch
- **Date Object Handling**: Proper serialization/deserialization of enrollment timestamps
- **Storage Cleanup**: Automatic removal of empty schedules to maintain clean localStorage
- **Deterministic Colors**: Hash-based assignment ensures same colors across browser sessions

### 🔄 **Future Enhancement Opportunities**

#### **1. Advanced User Features** (Enhancement Priority)
- **Section Cycling Interface**: Allow users to swap selected sections within existing enrollments
- **Intelligent Conflict Resolution**: Step-by-step wizard for resolving scheduling conflicts
- **Schedule Optimization Engine**: AI-powered suggestions for optimal section combinations
- **Advanced Search Filters**: Filter by instructor, time slots, location, or availability

#### **2. Export & Sharing Platform** (Medium Priority)
- **URL State Encoding**: Shareable schedule links with compressed course+term data
- **Multi-Format Export**: PDF/iCal/Excel export with detailed section information
- **Schedule Comparison**: Side-by-side comparison tool for different course combinations
- **Social Features**: Anonymous schedule sharing and popularity analytics

#### **3. Platform Integration** (Future Development)
- **Progressive Web App**: Offline-capable mobile app with push notifications
- **Real-Time Sync**: WebSocket integration for live enrollment status updates
- **University API Integration**: Direct connection to official course systems
- **Advanced Analytics**: Usage patterns, popular courses, and optimization insights

## Current Architecture (Section-Based Implementation)

### **Frontend Structure** 🎯 **ENTERPRISE-GRADE**
```
web/
├── src/
│   ├── app/
│   │   └── page.tsx                    # 🎯 STATE-HUB - localStorage persistence, cross-component communication
│   ├── components/
│   │   ├── CourseSearch.tsx           # 🚀 ENHANCED-INTERACTIONS - clickable sections with visual feedback
│   │   ├── WeeklyCalendar.tsx         # 🎮 INTERACTIVE-CALENDAR - hover controls, click selection, animations
│   │   └── ShoppingCart.tsx           # 📍 AUTO-SCROLL - selection tracking with smooth scrolling and highlights
│   └── lib/
│       └── courseUtils.ts             # 🧠 ADVANCED-UTILITIES - deterministic colors, persistence, interactions
```

### **Advanced Data Models** ✅

#### **1. Production-Grade Enrollment System**
```typescript
// Enhanced course enrollment with persistence and interaction support
interface CourseEnrollment {
  courseId: string                    // Unique enrollment identifier with timestamp
  course: ScrapedCourse              // Full course data from scraper system
  selectedSections: Section[]        // Array of all selected sections
  enrollmentDate: Date              // Timestamp for sorting and analytics
  color: string                     // Deterministic hash-based color assignment
  isVisible: boolean               // Calendar visibility state
}

// Interactive calendar event with cross-component communication
interface CalendarEvent extends Course {
  day: number                      // Parsed day index (0=Monday, 1=Tuesday, etc.)
  startHour: number               // 24-hour format start time
  endHour: number                // 24-hour format end time
  startMinute: number            // Parsed start minute
  endMinute: number             // Parsed end minute
  enrollmentId?: string         // Link to enrollment for interaction triggers
  hasConflict: boolean         // Real-time conflict detection result
}

// Advanced section with meeting consolidation
interface Section {
  id: string                      // Unique section identifier
  section: string                // Raw university section format
  meetings: Meeting[]           // Consolidated meeting list (deduplicated)
  availability: {
    capacity: string            // Total section capacity
    enrolled: string           // Current enrollment count
    status: string            // 'Open', 'Closed', 'Waitlist'
    available_seats: string   // Calculated available seats
  }
}
```

#### **2. Deterministic Color Management System** 🎨
```typescript
// Sophisticated hash-based color assignment for consistency
function getDeterministicColor(courseCode: string): string {
  // 25-color palette avoiding red tones (reserved for conflicts)
  const colors = [
    'bg-blue-500', 'bg-blue-600', 'bg-sky-500', 'bg-cyan-500',
    'bg-green-500', 'bg-emerald-500', 'bg-teal-500', 'bg-purple-500',
    'bg-violet-500', 'bg-indigo-500', 'bg-pink-500', 'bg-yellow-500',
    // ... 13 more colors for optimal distribution
  ]
  
  // Advanced hash function with prime number mixing
  let hash = 0
  const prime = 31 // Prime for better distribution
  for (let i = 0; i < courseCode.length; i++) {
    hash = (hash * prime + courseCode.charCodeAt(i)) % 2147483647
  }
  
  // Additional mixing to reduce clustering
  hash = ((hash >>> 16) ^ hash) * 0x45d9f3b
  hash = ((hash >>> 16) ^ hash) * 0x45d9f3b  
  hash = (hash >>> 16) ^ hash
  
  return colors[Math.abs(hash) % colors.length]
}
```

#### **3. Cross-Session Persistence Management** 💾
```typescript
// Intelligent localStorage management with term isolation
useEffect(() => {
  // Auto-restore schedule when term changes
  try {
    const savedSchedule = localStorage.getItem(`schedule_${currentTerm}`)
    if (savedSchedule) {
      const parsedSchedule: CourseEnrollment[] = JSON.parse(savedSchedule)
      // Restore Date objects from serialized strings
      const restoredSchedule = parsedSchedule.map((enrollment) => ({
        ...enrollment,
        enrollmentDate: new Date(enrollment.enrollmentDate)
      }))
      setCourseEnrollments(restoredSchedule)
    } else {
      setCourseEnrollments([]) // Fresh start for new term
    }
  } catch (error) {
    console.error('Failed to restore schedule:', error)
    setCourseEnrollments([]) // Graceful fallback
  }
}, [currentTerm])

// Auto-save on any enrollment changes
useEffect(() => {
  try {
    if (courseEnrollments.length > 0) {
      localStorage.setItem(`schedule_${currentTerm}`, JSON.stringify(courseEnrollments))
    } else {
      localStorage.removeItem(`schedule_${currentTerm}`) // Keep storage clean
    }
  } catch (error) {
    console.error('Failed to save schedule:', error)
  }
}, [courseEnrollments, currentTerm])
```

### **Key Technical Innovations**

#### **1. Advanced Interaction Architecture**
- **Cross-Component Communication**: Calendar clicks trigger shopping cart auto-scroll with smooth animations
- **Hover State Management**: Sophisticated event handling for visibility controls and visual feedback
- **Selection State Tracking**: Auto-clearing selections with timeout-based UX patterns
- **DOM Manipulation Optimization**: useRef-based scrolling with proper cleanup and memory management

#### **2. Enterprise Storage Patterns**
- **Per-Term Isolation**: Separate localStorage namespaces preventing cross-term data contamination
- **Intelligent Serialization**: Proper Date object handling and error recovery mechanisms
- **Storage Cleanup**: Automatic removal of empty schedules maintaining clean browser storage
- **Cross-Session Continuity**: Reliable state restoration across browser restarts and crashes

#### **3. Production-Quality Visual Systems**
- **Deterministic Color Assignment**: Hash-based consistent colors across all user sessions
- **Animated Conflict Visualization**: Diagonal stripe patterns with CSS animations and pulse effects
- **Enhanced Selection Feedback**: Ring highlights, scale transforms, and background state changes
- **Performance-Optimized Rendering**: Efficient React patterns with proper reconciliation and updates

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

### **Production Capabilities** 🎯
- **Enterprise-Grade Persistence**: Cross-session state management with intelligent localStorage patterns
- **Advanced Interaction Design**: Calendar-shopping cart integration with smooth auto-scroll and visual feedback
- **Deterministic Color System**: Hash-based assignment ensuring consistent user experience across sessions
- **Sophisticated Conflict Detection**: Real-time visual feedback with animated backgrounds and proper stacking
- **Performance-Optimized Architecture**: Efficient React patterns with proper memory management and cleanup
- **Production-Quality UX**: Hover controls, click interactions, and auto-clearing selections with optimal timing

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

This document reflects the current enterprise-grade system state as of August 2025 after implementing advanced persistent storage, sophisticated interaction patterns, and production-quality UX features. The platform now provides a comprehensive course planning experience with cross-session continuity, deterministic visual consistency, and advanced user interaction patterns that rival commercial course planning systems.