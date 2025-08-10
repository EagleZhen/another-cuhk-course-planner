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

### **🔧 Technical Debt & Next Steps**

**Priority 1: Shopping Cart Enhancement**
```typescript
// Current limitation: Orphan section cycling doesn't reveal compatible types
// F-LEC (orphan) → A-LEC should show newly available AE01-EXR, AT01-TUT

// Solution: Extend enrollment model
interface CourseEnrollment {
  selectedSections: InternalSection[]     // Current selections
  availableTypes: SectionTypeGroup[]     // Dynamic compatibility
  compatibilityMatrix: CompatibilityMap  // Real-time constraints
}
```

**Priority 2: Data Synchronization**
- Real-time badge updates for enrolled sections
- Smart detection of stale enrollment data
- Progressive course data loading

**Priority 3: Advanced Features**
- URL state encoding for shareable schedules
- Lazy loading architecture with subject-on-demand
- Mobile optimization with touch interactions

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

**Frontend Data Transformation:**
```typescript
// 2. Clean validation boundary  
External JSON → transformExternalCourseData() → InternalCourse[] → Components
Raw sections → Zod validation → Type-safe models → UI rendering
```

**State Management:**
```typescript
// 3. Persistent user state
Course selections → CourseEnrollment[] → localStorage → Cross-session restore
Section choices → Map<string,string> → Term-aware storage → Migration handling
```

## Known Issues & Limitations

**Shopping Cart Architecture:**
- Limited section cycling for orphan sections (F-LEC → A-LEC doesn't show new compatible types)
- Need full availability display instead of just selectedSections

**Data Synchronization:**
- Enrolled sections may reference stale availability data after JSON updates
- No real-time enrollment number refresh during active sessions

**Performance Opportunities:**
- Subject-on-demand loading not yet implemented
- No lazy loading for large course datasets

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

*Last updated: January 2025 - Reflects current enterprise-grade system with dynamic calendar, section compatibility, and complete type safety. Ready for production deployment and future enhancements.*