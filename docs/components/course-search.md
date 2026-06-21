# CourseSearch Component

**File:** [web/src/components/CourseSearch.tsx](../../web/src/components/CourseSearch.tsx)

Main search and filtering interface. Displays course cards with search buttons, filtering capabilities, and section selection.

## Component Structure

**Main Component:** `CourseSearch`

- Manages search state, selected term, course data loading
- Renders list of `CourseCard` components
- Handles course enrollment operations

**Child Component:** `CourseCard`

- Individual course display with search buttons, metadata, and sections
- Supports both desktop and mobile layouts
- Manages local section selections before adding to cart

---

## Search Buttons Design

### Current Implementation (Jan 2026)

Three bilingual search buttons per course:

1. **Outline Button**
   - Query: `CUHK ${subject}${courseCode} Outline OR 大綱`
   - Opens Google search in new tab

2. **Reviews Button**
   - Query: `CUHK ${subject}${courseCode} Review OR 評價`
   - Opens Google search in new tab

3. **Past Papers Button**
   - Query: `${subject}${courseCode}` (no space)
   - Searches CUHK Library (`cuhkLibrarySearchAndOpen()`)

### Design Decisions

**Why bilingual (English OR Chinese)?**

- CUHK students discuss courses in both English and Chinese (連登, LIHKG use "大綱", "評價")
- OR operator finds results with either term without being overly restrictive

**Why "CUHK" prefix?**

- Filters out results from other universities with the same course codes

**Why combine subject+code (no space)?**

- `CSCI3320` is more specific than `CSCI 3320`; common way students refer to courses

**Why separate Outline vs Reviews?**

- Different use cases: syllabus planning vs. experience sharing

**Why Past Papers is separate?**

- Uses CUHK Library (different engine + query format) rather than Google

---

## CourseCard Layout Design

### Desktop Layout

```
┌─────────────────────────────────────────────────────────────┐
│ [CSCI3320] [Outline] [Reviews] [Past Papers]     [Actions] │
│ Computer Graphics                                           │
│ [2 credits] [Graded] [45/200 Available Seats] [Instructors]│
└─────────────────────────────────────────────────────────────┘
```

**Layout rows:**

1. **Row 1:** Course code + Search buttons | Action buttons (right-aligned)
2. **Row 2:** Course title (full width)
3. **Row 3:** Metadata badges + Instructor filters

**Why title on a separate row?** Long titles break awkwardly when sharing row space with action buttons. Giving title its own full-width row lets it extend naturally without forced wrapping.

### Mobile Layout

```
┌───────────────────────────┐
│ CSCI3320                  │
│ Computer Graphics         │
│                           │
│ [Outline] [Reviews]       │
│ [Past Papers]             │
│                           │
│ [2 credits] [Graded]      │
│ [45/200 Available Seats]  │
│ [Instructors...]          │
│                           │
│ [Add to Cart]             │
│ [▼ Show Sections]         │
└───────────────────────────┘
```

Fully stacked; action buttons at bottom after metadata.

---

## Loading Experience

### State Initialization

`loading` is initialized to `true` so the loading UI renders immediately on first paint — no separate "preparing" flash state.

`hasDataLoaded` flag prevents "No courses available" from appearing before the first load completes.

### Progress UI

While loading, shows:

- Animated spinner + current subject being loaded
- Progress bar: `loaded / total` with percentage
- After 3 subjects: live stats line (right-aligned):
  `💾 12.3MB loaded · ⏳ ~4s remaining`

### Live Stats Implementation

```typescript
const loadingStartTimeRef = useRef<number | null>(null) // set when loading begins
const [loadedBytes, setLoadedBytes] = useState(0) // bytes accumulated in callbacks
```

**Estimated time formula (rate-based):**

```typescript
const elapsed = performance.now() - loadingStartTimeRef.current
const completionRate = loadingProgress.loaded / loadingProgress.total
const remainingMs = elapsed / completionRate - elapsed
```

This works correctly for parallel fetches — unlike a sequential average-per-file approach, it uses actual elapsed wall-clock time against real completion rate.

### Progress Messages

Three phase messages based on completion percentage:

- `< 30%` — "Initializing course data loading..."
- `30–70%` — "Processing course information..."
- `> 70%` — "Almost done! Finalizing course catalog..."

### PostHog Analytics

On completion, fires `course_data_loaded` via `analytics.courseDataLoaded()`:

```typescript
analytics.courseDataLoaded({
  totalLoadTimeMs,
  subjectCount,
  successCount,
  failedCount,
  totalSizeKb,
  slowestSubject,
  slowestTimeMs,
  avgTimeMs,
})
```

**Key question this answers:** What's the P90 load time? Are failures common? Which subjects are slowest?

---

## Seat Availability Badge

**Display:** Aggregate seat availability for the primary section type (usually LEC)

**Format:** `{available}/{total} Available Seats`

**Function:** `getAggregateSeatInfo()` in [courseUtils.ts](../web/src/lib/courseUtils.ts)

**Color coding** (via `getAvailabilityBadgeStyle()`):

- Green: >10 seats available
- Yellow: <10 seats available
- Red: 0 seats (closed)

**Why primary section type only?** It's the enrollment bottleneck. If LEC has seats, TUT/LAB typically do too.

**Why aggregate?** The collapsed card is a high-level overview. Per-section details appear on expand.

**Data freshness:** Scraped manually on a regular basis, not real-time. Always verify with CUSIS before enrolling.

---

## Filtering System

### Instructor Filters

- Badge-style toggle buttons per instructor
- Multiple selection (Set-based)
- "Clear Instructors" button when active

### Day Filters

- Only shown when card is expanded
- Only shows days that have available sections
- Multiple selection allowed

### Section Type Filters

- Collapsed by default per type with "Show All [Type]" link
- Click to expand; state managed per section type

---

## Props and Event Handlers

**Main Props:**

- `courseEnrollments` - Currently enrolled courses
- `onAddCourse` / `onRemoveCourse` / `onUpdateCourse` - Cart operations
- `currentTerm` - Active term filter
- `searchResults` - Filtered course list
- `onScrollToCart` - Scroll to course in cart
- `onDataUpdate` - Background data sync callback

**CourseCard Props:**

- `course`, `isAdded`, `initialSelections`
- All event handlers passed through

---

## Auto-Expand Behavior

When a new search fires (`searchSequence` increments), the first result auto-expands sections. Useful when searching for a specific course code.

---

## Known Issues & Limitations

**Layout:**

- Search buttons may wrap to a second line on narrow windows

**Search:**

- Bilingual only covers English + Traditional Chinese (no Simplified Chinese support)
- Google results depend on Google's availability in user's region

**Filtering:**

- Instructor filters don't support partial name matching
- Day filters show day presence only, not time ranges
- No "Clear All Filters" for day filters

**Data Loading:**

- Loads all subjects on startup (~249 files) instead of on-demand
- No retry or warning if some subjects fail mid-load (partial load is silent)

---

## Component Size

**Lines of code:** ~2100+ (includes CourseCard)

**Complexity factors:**

- Desktop vs mobile layout differences
- Section filtering + instructor filtering logic
- Auto-completion logic integration
- State synchronization with shopping cart
- Live loading progress UI

**Future considerations:**

- Split CourseCard into separate file
- Extract filtering logic into custom hooks
- Lazy-load subjects on demand instead of all at startup

---

**Last updated:** February 2026
