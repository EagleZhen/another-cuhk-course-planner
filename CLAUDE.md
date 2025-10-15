# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**CUHK Course Planner**: Production-ready Next.js course scheduling application with enterprise-grade architecture.

## Development Commands

**Frontend (React 19 + Next.js 15):**
```bash
cd web
npm install
npm run dev          # Development server with Turbopack
npm run build        # Production build (must pass with zero errors/warnings)
npm run lint         # ESLint quality check
```

**Data Scraping (Python 3.8+):**
```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python scrape_all_subjects.py   # Production scraping (~50MB, 259 files)
```

## Architecture Overview

**Data Flow (Strict Layered Pattern):**
```typescript
External JSON → Zod Validation → Internal Types → React Components
     ↓               ↓              ↓               ↓
Raw scraped     Runtime check    Clean domain    Type-safe UI
(~50MB data)    (validation.ts)  (types.ts)      (page.tsx hub)
```

**File Structure:**
```
web/src/
├── app/
│   ├── layout.tsx              # Root layout with PostHog analytics
│   └── page.tsx                # MAIN STATE HUB - all global state lives here
├── components/
│   ├── CourseSearch.tsx        # Search + filtering + section compatibility
│   ├── WeeklyCalendar.tsx      # Visual calendar with conflict detection
│   ├── ShoppingCart.tsx        # Enrollment management + section cycling
│   └── ui/                     # shadcn/ui components
└── lib/
    ├── types.ts                # Internal domain models (zero `any`)
    ├── validation.ts           # Zod schemas + snake_case→camelCase transformation
    ├── courseUtils.ts          # Pure functions (1,276 lines, zero coupling)
    ├── calendarConfig.ts       # Calendar constants + section type config
    ├── analytics.ts            # PostHog wrapper
    └── screenshotUtils.ts      # html-to-image calendar export
```

**State Management (page.tsx as Single Hub):**
- All global state managed via React hooks in [page.tsx](web/src/app/page.tsx)
- Term-scoped localStorage: `schedule_${currentTerm}`
- Data flows down through props, events bubble up through handlers
- No prop drilling (max 3 levels), no global variables

## Critical Architecture Patterns

### 1. Type Safety Boundary (Zero `any` Policy)

**Three-Layer System:**
```typescript
// Layer 1: External Data (validation.ts) - ONLY file with `any` types
const ExternalCourseSchema = z.object({
  subject: z.string(),
  course_code: z.string(),  // snake_case from Python scraper
  // ...
})

export function transformExternalCourse(external: unknown): InternalCourse {
  const validated = ExternalCourseSchema.parse(external)  // Runtime check
  return { /* transform to camelCase */ }
}

// Layer 2: Internal Types (types.ts) - Clean domain models
export interface InternalCourse {
  subject: string
  courseCode: string  // camelCase
  // ... zero `any` types
}

// Layer 3: Components & Utils - Internal types exclusively
function doSomething(course: InternalCourse) { /* ... */ }
```

**Enforcement:**
- All external data MUST pass through `validation.ts` transformation
- Components/utilities NEVER import or use external types
- TypeScript strict mode enabled

### 2. Section Compatibility (CUHK Cohort System)

**Problem:** CUHK uses letter-prefixed cohorts. A-LEC can only pair with AE01-EXR (same A-cohort), but --LEC and -E01-EXR are universal wildcards.

**Implementation in [courseUtils.ts](web/src/lib/courseUtils.ts):**
```typescript
export function getSectionPrefix(sectionCode: string): string | null {
  const match = sectionCode.match(/^([A-Z])/)
  return match ? match[1] : null  // "A" from "A-LEC", null for "--LEC"
}

export function areSectionsCompatible(section1, section2): boolean {
  const prefix1 = getSectionPrefix(section1.sectionCode)
  const prefix2 = getSectionPrefix(section2.sectionCode)

  // null (wildcard) is compatible with anything
  return prefix1 === null || prefix2 === null || prefix1 === prefix2
}
```

**Auto-Completion with Hierarchical Cascade:**
When user changes a lecture section, incompatible lower-priority sections are auto-removed and compatible ones are auto-added. Priority: LEC → EXR → TUT → LAB.

See `autoCompleteEnrollmentSections()` in [courseUtils.ts](web/src/lib/courseUtils.ts:800-900) for full logic.

### 3. Configuration-Driven Section Types

**Single Source of Truth:** `SECTION_TYPE_CONFIG` in [calendarConfig.ts](web/src/lib/calendarConfig.ts)

```typescript
export const SECTION_TYPE_CONFIG = {
  'LEC': { displayName: 'Lecture', icon: '🧑‍🏫', aliases: ['LEC'], priority: 1 },
  'TUT': { displayName: 'Interactive Tutorial', icon: '🙌', aliases: ['TUT'], priority: 3 },
  // ... 20+ section types
} as const

export type SectionType = keyof typeof SECTION_TYPE_CONFIG  // Discriminated union
```

**Benefits:**
- Type definitions in sync with configuration (no drift)
- Exhaustive case checking in TypeScript
- Easy to add new section types

### 4. Deterministic Color Assignment (SSR-Safe)

**Problem:** Colors must be identical between server/client and across sessions.

**Solution in [courseUtils.ts](web/src/lib/courseUtils.ts:200-230):**
```typescript
export function getDeterministicColor(courseCode: string): string {
  // Polynomial rolling hash (Java-style) + MurmurHash3 finalizer
  let hash = 0
  const prime = 31

  for (let i = 0; i < courseCode.length; i++) {
    hash = hash * prime + courseCode.charCodeAt(i)
  }

  // MurmurHash3 mixing for better distribution
  hash = hash ^ (hash >>> 16)
  hash = (hash * 0x85ebca6b) >>> 0
  // ... more mixing

  // 72-color Tailwind palette (hardcoded for build inclusion)
  return DETERMINISTIC_COLORS[Math.abs(hash) % 72]
}
```

### 5. Background Data Sync (Partial State Updates)

**Problem:** When course data updates, enrolled courses might become invalid, but we don't want to delete user's selections.

**Solution in [page.tsx](web/src/app/page.tsx:300-400):**
```typescript
const handleDataUpdate = (timestamp: Date, allFreshCourses: InternalCourse[]) => {
  setCourseEnrollments(currentEnrollments => {
    return currentEnrollments.map(enrollment => {
      const freshCourse = allFreshCourses.find(/* match by subject+code */)

      if (!freshCourse) {
        // Mark as invalid but DON'T DELETE (preserve user context)
        return { ...enrollment, isInvalid: true, invalidReason: 'Course no longer exists' }
      }

      // Update sections with fresh availability data
      const syncedSections = enrollment.selectedSections.map(oldSection => {
        const freshSection = findMatchingSection(freshCourse, oldSection.id)
        return freshSection || { ...oldSection, isInvalid: true }
      })

      return { ...enrollment, course: freshCourse, selectedSections: syncedSections }
    })
  })
}
```

**Benefits:**
- User sees what became invalid (with reason)
- No silent deletions
- Fresh data automatically synced

### 6. Conflict Detection (Two-Phase Computation)

**Phase 1: Convert enrollments → calendar events**
```typescript
const calendarEvents = useMemo(() => {
  const events = enrollmentsToCalendarEvents(courseEnrollments)
  return detectConflicts(events)  // Add hasConflict flag
}, [courseEnrollments])
```

**Phase 2: Detect overlaps in [courseUtils.ts](web/src/lib/courseUtils.ts:500-550):**
```typescript
export function detectConflicts(events: CalendarEvent[]): CalendarEvent[] {
  const visibleEvents = events.filter(e => e.isVisible)

  return events.map(event => ({
    ...event,
    hasConflict: visibleEvents.some(other => {
      if (other.id === event.id) return false
      return doTimesOverlap(parseTimeRange(event.time), parseTimeRange(other.time))
    })
  }))
}
```

### 7. ICS Calendar Export (Timezone Handling)

**Problem:** Exchange students in different timezones need correct times.

**Solution in [courseUtils.ts](web/src/lib/courseUtils.ts:1100-1200):**
```typescript
// Parse as Hong Kong time, export as UTC
const hongKongTime = moment.tz(dateTimeString, 'Asia/Hong_Kong')
const utcTime = hongKongTime.utc()

// ICS library accepts UTC and handles conversion
{
  title: `${course.subject}${course.courseCode} ${section.sectionType}`,
  start: utcTime.toArray(),  // [year, month, day, hour, minute]
  startInputType: 'utc',
  startOutputType: 'utc'
}
```

## Data Scraping Architecture

**Production Scraper ([cuhk_scraper.py](cuhk_scraper.py)):**
- OCR captcha solving with `ddddocr` library
- Configurable scope: basic listings vs. full details + enrollment + course outcomes
- Progress tracking with periodic saves (resilient to interruptions)
- Per-subject JSON output (259 files in `data/`)
- HTML to Markdown conversion for course outcomes

**Key Classes:**
```python
@dataclass
class ScrapingConfig:
    max_courses_per_subject: Optional[int] = None  # Unlimited for production
    get_details: bool = True
    get_enrollment_details: bool = True
    get_course_outcome: bool = True
    output_directory: str = "data"

@dataclass
class Course:
    subject: str
    course_code: str
    title: str
    terms: List[TermInfo]  # Multiple terms supported
    # ... enrollment, descriptions, learning outcomes
```

**Usage:**
```bash
python scrape_all_subjects.py  # Scrapes all ~259 subjects
```

## Known Issues & Limitations

**Critical Issues:**
- **Partial Data Loading**: App continues with incomplete data when network fails mid-load (~50MB)
  - Causes false "course no longer exists" errors when sync runs with partial data
  - Need all-or-nothing loading with retry mechanism and user feedback
- **Analytics Gap**: No performance metrics for data loading duration

**Current Limitations:**
- Loads all subjects on startup (200+ files) instead of on-demand
- No live enrollment updates during active sessions
- Shopping cart limited section cycling for orphan sections

**Architecture Debt:**
- [page.tsx](web/src/app/page.tsx) is becoming large (main state hub)
- [courseUtils.ts](web/src/lib/courseUtils.ts) is 1,276 lines (could be split by category)
- Could benefit from lazy loading for non-essential subjects

## Quality Standards

**TypeScript Requirements:**
- `npm run build` must pass with zero errors/warnings
- No `any` types outside [validation.ts](web/src/lib/validation.ts)
- All external data validated through Zod schemas
- Strict mode enabled

**Code Organization:**
- [validation.ts](web/src/lib/validation.ts): External data + transformation (only file with `any`)
- [types.ts](web/src/lib/types.ts): Clean internal domain models
- [courseUtils.ts](web/src/lib/courseUtils.ts): Pure functions using internal types
- Components: Internal types exclusively

## Infrastructure

**Production Environment:**
- **Hosting**: Cloudflare Pages (zero cost, unlimited Edge requests)
- **Analytics**: PostHog with ad blocker bypass (`/x8m2k` proxy)
- **Performance**: <1s load times, session caching, parallel JSON loading
- **Timezone**: Hong Kong UTC+8 with moment-timezone

**Data Storage:**
- Term-scoped localStorage: `schedule_${currentTerm}`
- Version-based migration for schema changes
- Corrupted data cleared with user notification

## Special Conventions

1. **Section Type as Discriminated Union:**
   - `SectionType = keyof typeof SECTION_TYPE_CONFIG`
   - Keeps types in sync with configuration

2. **Component Prop Organization:**
   - Data props first (courseEnrollments, events)
   - Handlers second (onAdd, onRemove, onUpdate)
   - Callbacks last (onDataUpdate, onSearchControlReady)

3. **Calendar Math:**
   - Dynamic hour height based on minimum course duration
   - All coordinates computed, not hardcoded

4. **Debug Logging:**
   - Extensive console logs with emoji prefixes
   - Not removed in production (useful for troubleshooting)

5. **Hydration Safety:**
   ```typescript
   const [isHydrated, setIsHydrated] = useState(false)

   useEffect(() => {
     if (!isHydrated) return  // Prevent SSR/client mismatch
     // Safe to access localStorage now
   }, [isHydrated])
   ```

*Last updated: October 2025 - Production-ready system. Critical data integrity improvements needed for partial loading scenarios.*
