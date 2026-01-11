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

**Data Scraping (Python 3.8+, Poetry):**
```bash
poetry install --no-root                      # Install dependencies (scripts-only project)
poetry run python scripts/scrape_all_subjects.py   # Production scraping (~50MB, 259 files)
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
    ├── subjects.ts             # Subject code→title mapping (single source of truth)
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

### 8. Subject Management (Single Source of Truth)

**Problem:** Subject codes and titles need to be consistent across data loading, UI tooltips, and publishing validation.

**Solution:** `lib/subjects.ts` serves as the single source of truth for all subject-related data.

**Architecture:**
```
data/*.json (scraped) → scripts/generate_subjects.py → lib/subjects.ts → App
                                                             ↓
                                                    publish_course_data.py (validates)
```

**Key Components:**

1. **`lib/subjects.ts`** - Single source of truth (249 subjects)
   ```typescript
   const SUBJECT_TITLES: Record<string, string> = {
     'ACCT': 'Accountancy',
     'CSCI': 'Computer Science',
     // ... 247 more
   } as const

   export function getSubjectTitle(code: string): string
   export function getAllSubjectCodes(): string[]
   ```

2. **`scripts/generate_subjects.py`** - Generates TypeScript constant
   - Reads all `data/*.json` files
   - Extracts `metadata.subject` and `metadata.subject_title`
   - Excludes 10 exemption codes: `EX_PGDE`, `EX_RPG`, `EX_TPG`, `EX_UG`, `XCBS`, `XCCS`, `XFUD`, `XUNC`, `XUSC`, `XWAS`
   - Outputs TypeScript constant for manual copy-paste

3. **`publish_course_data.py`** - Strict validation (blocks on mismatch)
   - Parses `subjects.ts` to extract registered subjects
   - Compares with scraped data files
   - **Blocks publishing** if mismatch detected
   - Provides clear fix instructions

**Workflow:**

```bash
# 1. Always run publish script first (validates automatically)
poetry run python scripts/publish_course_data.py

# 2. If subject list mismatch detected, the script will block and tell you to:
poetry run python scripts/generate_subjects.py

# 3. Copy output to web/src/lib/subjects.ts (replace SUBJECT_TITLES constant only)
#    Keep getSubjectTitle() and getAllSubjectCodes() functions intact

# 4. Run publish again to verify
poetry run python scripts/publish_course_data.py
```

**Benefits:**
- ✅ Subject tooltips in UI (e.g., "ACCT" → "Accountancy")
- ✅ CourseSearch loads 249 subjects (not 259, saves 10 network requests)
- ✅ Guaranteed consistency - publishing blocked if subjects.ts is stale
- ✅ Zero runtime overhead (static lookup)

**Exclusion List Consistency:**
All three places use identical exclusion logic:
- `scripts/generate_subjects.py` - Line 18
- `scripts/publish_course_data.py` - Line 118
- `web/src/lib/subjects.ts` - Generated output (249 subjects)

### 9. Display Formatting Helpers (Centralized Logic)

**Problem:** Course codes and instructor names need consistent formatting across the app. Cohort prefixes (A, B, etc.) should be shown with course codes, and multiple instructors need proper title formatting.

**Solution in [courseUtils.ts](web/src/lib/courseUtils.ts):**
```typescript
// Course code formatting with cohort prefix
export function formatCourseCodeWithPrefix(subject: string, courseCode: string, sectionCode: string): string
// Examples: ("CSCI", "3320", "A-LEC") → "CSCI3320A"
//           ("CSCI", "3320", "--LEC") → "CSCI3320"

export function formatCourseCodeWithSection(subject: string, courseCode: string, sectionCode: string): string
// Examples: ("CSCI", "3320", "A-LEC") → "CSCI3320A LEC"

// Multi-instructor formatting
export function formatInstructorsCompact(instructorString: string): string
// Example: "Professor Noam NOKED, Professor Steven Brian GALLAGHER"
//       → "Prof. Noam NOKED, Prof. Steven Brian GALLAGHER"
```

**Internal Helpers (Not Exported):**
- `extractSectionType()` - Extracts section type from section code
- `formatInstructorCompact()` - Formats single instructor ("Professor" → "Prof.")

**Benefits:**
- ✅ Consistent cohort prefix display across WeeklyCalendar, ShoppingCart, ICS exports
- ✅ Proper multi-instructor formatting (fixes bug where only first instructor was formatted)
- ✅ Prevents misuse by hiding single-item helpers (internal only)
- ✅ Simple string-based signatures work with any data structure

### 10. Mobile Notice Image Loading Priority & Versioning

**Problem:** Mobile users see a desktop preview notice with image (~100KB), but course data loading (200+ JSON files, ~50MB) starts simultaneously, causing the small image to compete for bandwidth and load slowly. Need ability to re-show notice for promotion campaigns.

**Solution:** Event-based coordination between `MobileDesktopNotice` and `CourseSearch` to delay heavy data loading until preview image is ready, with versioning system for controlled re-display.

**Centralized Configuration ([lib/constants.ts](web/src/lib/constants.ts)):**
```typescript
// Single source of truth - change version here to re-show notice to all users
export const MOBILE_BREAKPOINT = 768
export const NOTICE_STORAGE_KEY = 'desktop-notice-version'
export const NOTICE_VERSION = '1'  // Bump to '2', '3', etc. for re-showing
export const NOTICE_IMAGE_LOADED_EVENT = 'mobile-notice-image-loaded'
```

**Detection Logic ([MobileDesktopNotice.tsx](web/src/components/MobileDesktopNotice.tsx)):**
```typescript
import { MOBILE_BREAKPOINT, NOTICE_STORAGE_KEY, NOTICE_VERSION, NOTICE_IMAGE_LOADED_EVENT } from '@/lib/constants'

useEffect(() => {
  const isMobile = window.innerWidth < MOBILE_BREAKPOINT
  const seenVersion = localStorage.getItem(NOTICE_STORAGE_KEY)

  // Cleanup old localStorage key (migration)
  localStorage.removeItem('desktop-notice-seen')

  if (isMobile && seenVersion !== NOTICE_VERSION) {
    setShowNotice(true)
  }
}, [])
```

**Event Dispatch - Three Trigger Points:**
```typescript
// 1. Image loads successfully
onLoad={() => {
  setImageLoaded(true)
  window.dispatchEvent(new Event(NOTICE_IMAGE_LOADED_EVENT))
}}

// 2. Image fails to load
onError={() => {
  console.error('Preview image failed to load')
  window.dispatchEvent(new Event(NOTICE_IMAGE_LOADED_EVENT))
}}

// 3. User dismisses before image loads
const dismissNotice = () => {
  localStorage.setItem(NOTICE_STORAGE_KEY, NOTICE_VERSION)
  setShowNotice(false)
  window.dispatchEvent(new Event(NOTICE_IMAGE_LOADED_EVENT))
}
```

**Event Listener ([CourseSearch.tsx](web/src/components/CourseSearch.tsx)):**
```typescript
import { MOBILE_BREAKPOINT, NOTICE_STORAGE_KEY, NOTICE_VERSION, NOTICE_IMAGE_LOADED_EVENT } from '@/lib/constants'

const isMobile = window.innerWidth < MOBILE_BREAKPOINT
const seenVersion = localStorage.getItem(NOTICE_STORAGE_KEY)
const shouldWaitForImage = isMobile && seenVersion !== NOTICE_VERSION

if (shouldWaitForImage) {
  const handleImageLoaded = () => loadCourseData()
  window.addEventListener(NOTICE_IMAGE_LOADED_EVENT, handleImageLoaded, { once: true })

  return () => {
    window.removeEventListener(NOTICE_IMAGE_LOADED_EVENT, handleImageLoaded)
  }
} else {
  loadCourseData()  // Desktop or returning users
}
```

**Re-showing Notice for Promotion:**
```typescript
// In lib/constants.ts - change this line:
export const NOTICE_VERSION = '2'  // All mobile users will see notice again
```

**Key Design Decisions:**
- ✅ **Centralized constants** - Single source of truth in `lib/constants.ts` prevents sync issues
- ✅ **String versioning** - Avoids type coercion issues with localStorage (stores '1', not 1)
- ✅ **Window events** for cross-component coordination (components are cousins, not parent-child)
- ✅ **`{ once: true }` flag** - Auto-removes listener after first event (handles multiple dispatch sources)
- ✅ **Three dispatch points** - Ensures data never gets blocked (image success, failure, or early dismissal)
- ✅ **Bidirectional comments** - Document event source/listener locations (events create hidden dependencies)
- ✅ **Old key cleanup** - Removes legacy `desktop-notice-seen` key on mount

**Use Case - Promotion Workflow:**
1. Post on Threads/social media (mobile traffic expected)
2. Bump `NOTICE_VERSION` from '1' to '2' in `lib/constants.ts`
3. Deploy
4. All mobile users (old + new) see notice again
5. They dismiss → stores version '2'

**Trade-offs:**
- ⚠️ Event system adds complexity vs simple timeout approach
- ⚠️ Hidden coupling via event name (mitigated by constants + comments)
- ⚠️ Multiple event dispatches (harmless due to `once: true` but can confuse reviewers)
- ✅ Guarantees image loads before data (vs timeout which is best-effort)
- ✅ Version control enables strategic re-showing without annoying users

**Benefits:**
- ✅ Mobile first-time users see preview image immediately without competing requests
- ✅ Data loads as soon as image is ready (not arbitrary timeout)
- ✅ Proper error handling prevents blocking on image failure
- ✅ Controlled re-display for marketing campaigns
- ✅ Single-file version bump (maintainable)

### 11. ICS Calendar Import Undo (STATUS:CANCELLED Pattern)

**Problem:** Users sometimes import course schedules to the wrong calendar app (Google Calendar, Outlook, Apple Calendar). Standard ICS exports don't provide a way to undo this mistake, requiring manual deletion of each event.

**Solution:** Generate an "undo file" that adds `STATUS:CANCELLED` to all events. When re-imported, calendar apps recognize the CANCELLED status and remove the corresponding events.

**UI Implementation in [WeeklyCalendar.tsx](web/src/components/WeeklyCalendar.tsx):**
- **Split button pattern** matching instructor toggle button style
- Left section: Download .ics with confirmation dialog (includes tips on creating new calendar)
- Right section: Dropdown with "Undo Previous Import" option
- **Inline helper text** in dropdown: "Upload original .ics to cancel events" (always visible, not hidden in tooltip)
- Independent hover effects for each section
- Z-index `z-[60]` for dropdown menu (avoids overlap with sticky calendar header's `z-50`)

**Export Confirmation Dialog ([WeeklyCalendar.tsx:251-258](web/src/components/WeeklyCalendar.tsx#L251-L258)):**
```typescript
const proceed = confirm(
  '💡 How to use the .ics file:\n\n' +
  '1. Create a NEW calendar in your calendar app (Google Calendar, Outlook, etc.).\n' +
  '2. Import the downloaded .ics file to that NEW calendar\n\n' +
  'This keeps your course schedule separate and easier to manage.\n\n' +
  'P.S. If you imported to the wrong calendar, use the dropdown menu (▼) → "Undo Previous Import" to cancel all events.\n\n' +
  'Click OK to proceed with the export.'
)
```

**User Flow (Undo Feature):**
1. Click dropdown chevron → "Undo Previous Import" menu appears with inline helper text
2. Click menu item → File picker opens immediately
3. User selects original .ics file → Confirmation dialog appears
4. User confirms → Validation checks `PRODID` → Warns if file wasn't from our app (allows proceed)
5. Auto-download `(UNDO) filename.ics` with modified events

**Key Implementation Detail - Browser User Activation:**
File picker must open immediately on click to maintain "user activation" chain. Confirmation dialog happens AFTER file selection to avoid browser security errors ("File chooser dialog can only be shown with a user activation").

**Processing Logic in [courseUtils.ts](web/src/lib/courseUtils.ts:1322):**
```typescript
export function processICSForUndo(content: string): {
  success: boolean
  modifiedContent?: string
  needsWarning?: boolean
  error?: string
} {
  // Validate file origin
  const isFromOurApp = content.includes('PRODID:Another CUHK Course Planner')

  // Detect original line ending style to preserve it (CRLF vs LF)
  const eol = content.includes('\r\n') ? '\r\n' : '\n'

  // Add STATUS:CANCELLED after each BEGIN:VEVENT
  const modifiedContent = content.replace(
    /BEGIN:VEVENT/g,
    `BEGIN:VEVENT${eol}STATUS:CANCELLED`
  )

  return {
    success: true,
    modifiedContent,
    needsWarning: !isFromOurApp  // Warn but allow non-app files
  }
}
```

**Key Design Decisions:**
- ✅ Confirmation dialog AFTER file selection (avoids user activation security issues)
- ✅ Line ending preservation (CRLF vs LF) for cross-platform compatibility
- ✅ Simple string replacement vs. complex ICS parsing (more robust)
- ✅ Warning dialog instead of blocking validation (user choice)
- ✅ `(UNDO)` filename prefix at front for better visibility
- ✅ Inline helper text vs tooltips (users actually see instructions)
- ✅ Export confirmation with tips about new calendar + undo feature mention
- ✅ Alert/confirm boxes instead of modal (simpler UX)
- ✅ Programmatic file input trigger (hidden input element)
- ✅ Analytics tracking: `icsExported()` and `icsUndo()` events

**Benefits:**
- ✅ One-click undo for mistaken calendar imports
- ✅ Works with any calendar app supporting ICS standard (RFC 5545)
- ✅ Validates file origin but allows flexibility for edge cases
- ✅ Consistent UI pattern across calendar export features
- ✅ Proactive user education (export tips mention undo feature)
- ✅ No browser security errors (proper user activation handling)

## Data Scraping Architecture

**Production Scraper ([scripts/cuhk_scraper.py](scripts/cuhk_scraper.py)):**
- OCR captcha solving with `ddddocr` library
- Configurable scope: basic listings vs. full details + enrollment + course outcomes
- Progress tracking with periodic saves (resilient to interruptions)
- Per-subject JSON output (259 files in `data/`)
- HTML to Markdown conversion for course outcomes
- **Infinite retry mechanism** for transient errors (network issues, corrupted HTML)
- **System error detection** for permanent failures (doesn't retry malformed CUHK data)

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
poetry run python scripts/scrape_all_subjects.py  # Scrapes all ~259 subjects
```

**Retry Mechanism (Robust Error Handling):**

The scraper implements layered retry strategies to prevent data loss from transient network issues:

1. **HTTP Layer** ([`_robust_request()`](scripts/cuhk_scraper.py#L329-389)):
   - Infinite retry for network errors (ConnectionError, Timeout, 502/503/504)
   - Exponential backoff (1s → 2s → 4s → ... → max 60s)
   - Pre-loads response content to catch mid-transfer drops

2. **Validation Layer** ([`get_course_details()`](scripts/cuhk_scraper.py#L845-873)):
   - Infinite retry for validation failures (corrupted HTML, missing buttons)
   - Re-fetches entire course details page on corruption
   - Raises `ValueError` to bubble up transient errors

3. **Domain Layer** ([`_scrape_course_outcome()`](scripts/cuhk_scraper.py#L1395-1435)):
   - Detects **permanent** system errors (malformed CUHK data) → doesn't retry
   - Detects **transient** validation errors (missing buttons, corrupted HTML) → raises `ValueError`
   - Tracks failed outcomes for manual review

**Error Classification:**
```python
# Transient (retry infinitely)
- Network issues (connection drops, timeouts)
- Corrupted HTML (missing buttons, incomplete pages)
- Validation failures (malformed responses)

# Permanent (don't retry)
- System errors on course outcome pages (CUHK database issues)
- These are tracked in logs/summary/failed_course_outcomes.txt
```

**Key Pattern:**
```python
# Helper method extracts ASP.NET hidden fields (ViewState, etc.)
# Used 6 times across scraper - eliminates duplication
form_data = self._extract_asp_hidden_fields(soup)
```

## Known Issues & Limitations

**Critical Issues (Frontend):**
- **Partial Data Loading**: App continues with incomplete data when network fails mid-load (~50MB)
  - Causes false "course no longer exists" errors when sync runs with partial data
  - Need all-or-nothing loading with retry mechanism and user feedback
- **Analytics Gap**: No performance metrics for data loading duration

**Resolved Issues (Scraper):**
- ✅ **Network-induced data loss** (Fixed Nov 2025): Corrupted HTML from network issues no longer causes silent data loss
  - Infinite retry mechanism detects missing buttons and re-fetches pages
  - System errors on course outcomes are properly classified as permanent (no infinite retry)

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

**Python Formatting:**
- Pre-commit hooks enforce **Ruff** (linting + formatting) + **isort** (import sorting)
- Automatic on commit: `poetry run pre-commit install` (one-time setup)
- Manual run: `poetry run pre-commit run` (checks staged files only)
- Config: [pyproject.toml](pyproject.toml) (100 char line, double quotes, black-compatible imports)
- JSON files: Use `save_json_with_newline()` helper in [data_utils.py](scripts/data_utils.py)

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

*Last updated: November 2025 - Production-ready system. Scraper now has robust retry mechanism preventing network-induced data loss. Frontend data loading improvements still needed.*
