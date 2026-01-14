# CourseSearch Component

**File:** [web/src/components/CourseSearch.tsx](../web/src/components/CourseSearch.tsx)

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
   - Example: `CUHK CSCI3320 Outline OR 大綱`
   - Opens Google search in new tab

2. **Reviews Button**
   - Query: `CUHK ${subject}${courseCode} Review OR 評價`
   - Example: `CUHK CSCI3320 Review OR 評價`
   - Opens Google search in new tab

3. **Past Papers Button**
   - Query: `${subject}${courseCode}` (no space)
   - Example: `CSCI3320`
   - Searches CUHK Library (`cuhkLibrarySearchAndOpen()`)

### Design Decisions

**Why bilingual (English OR Chinese)?**
- CUHK students discuss courses in both English and Chinese
- Chinese forums (e.g., 連登, LIHKG) use terms like "大綱" and "評價"
- OR operator keeps search flexible - finds results with either term
- Not overly restrictive while still being targeted

**Why keep "CUHK" prefix?**
- Filters out results from other universities
- "CSCI 3320" might match courses from other schools
- Simple one-word filter prevents irrelevant results

**Why combine subject+code (no space)?**
- `CSCI3320` is more specific than `CSCI 3320`
- Common way students refer to courses
- Reduces false matches from partial matches

**Why separate Outline and Reviews (not just one Google button)?**
- Different use cases: syllabus planning vs. experience sharing
- Targeted results are better than generic course search
- Still simple (just 2 Google buttons + 1 library button)

**Why keep Past Papers separate?**
- Uses different search engine (CUHK Library, not Google)
- Library search requires different query format (no space)
- Distinct purpose justifies separate button

### Evolution History

**Original design:**
- "Course Outline", "Course Reviews", "Past Papers"
- Query: `CUHK ${subject}${courseCode} Outline OR Syllabus`
- With exact match quotes: `"${subject}" "${courseCode}"`

**Attempted simplification (rejected):**
- Single "Google" button with `CUHK ${subject} ${courseCode}`
- Too generic - not targeted enough
- Lost distinction between outline vs reviews

**Final design (current):**
- Bilingual OR queries for flexibility
- Combined subject+code for specificity
- CUHK prefix for relevance
- Three buttons for distinct purposes

---

## CourseCard Layout Design

### Desktop Layout

**Current Structure:**
```
┌─────────────────────────────────────────────────────────────┐
│ [CSCI3320] [Outline] [Reviews] [Past Papers]     [Actions] │
│ Computer Graphics                                           │
│ [2 credits] [Graded] [Instructor filters...]               │
└─────────────────────────────────────────────────────────────┘
```

**Layout rows:**
1. **Row 1:** Course code + Search buttons | Action buttons (right-aligned)
2. **Row 2:** Course title (full width)
3. **Row 3:** Metadata badges + Instructor filters

### Design Decision: Why Title on Separate Row?

**Problem:** Long course titles would break into multiple lines if constrained by action buttons

**Example of the issue:**
```
[MBTE3528] [Buttons...]                    [Remove] [Scroll] [Added]
Project in Transgenic technologies in Animals and their
Applications
```
Title breaks awkwardly mid-sentence when sharing row space.

**Solution:** Give title its own full-width row
```
[MBTE3528] [Buttons...]                    [Remove] [Scroll] [Added]
Project in Transgenic technologies in Animals and their Applications
```
Title can extend full width without wrapping unless truly necessary.

**Attempted alternatives (all reverted):**
1. **Two-column grid layout** - Action buttons blocked left content from using space
2. **Absolute positioning** - Created unnatural spacing between rows
3. **Grid with row spanning** - Complex, didn't solve fundamental issue
4. **Baseline alignment** - Didn't help with button padding visual weight

**Conclusion:** Simple stacked layout is best
- Row 1: Code + search buttons (can wrap if needed)
- Row 2: Title (gets full width)
- Row 3: Metadata (gets full width)
- Action buttons right-aligned on Row 1

### Mobile Layout

**Structure:**
```
┌───────────────────────────┐
│ CSCI3320                  │
│ Computer Graphics         │
│                           │
│ [Outline] [Reviews]       │
│ [Past Papers]             │
│                           │
│ [2 credits] [Graded]      │
│ [Instructors...]          │
│                           │
│ [Add to Cart]             │
│ [▼ Show Sections]         │
└───────────────────────────┘
```

**Design:** Fully stacked, action buttons at bottom after metadata

---

## Seat Availability Badge

### Feature

**Display:** Aggregate seat availability for primary section type (usually LEC)

**Format:** `{available}/{total} Available Seats`

**Example:** `45/200 Available Seats` (45 seats available out of 200 total)

### Implementation

**Function:** `getAggregateSeatInfo()` in [courseUtils.ts](../web/src/lib/courseUtils.ts)

```typescript
export function getAggregateSeatInfo(
  course: InternalCourse,
  termName: string
): { available: number; total: number; type: SectionType } | null
```

**Logic:**
1. Get all section types for the course using `parseSectionTypes()`
2. Select primary section type (first in priority order, usually LEC)
3. Sum `availableSeats` across all sections of that type
4. Sum `capacity` across all sections of that type
5. Return aggregate data or null if no data available

### Color Coding

Uses existing `getAvailabilityBadgeStyle()` function for consistency:

- **Green** (`bg-green-100 text-green-800 border-green-300`): >10 seats available
- **Yellow** (`bg-yellow-100 text-yellow-800 border-yellow-300`): <10 seats available
- **Red** (`bg-red-100 text-red-800 border-red-300`): 0 seats (closed)

### Design Decisions

**Why primary section type only?**
- Primary section type (usually LEC) is the bottleneck for enrollment
- If lecture sections have seats, tutorial/lab sections typically have seats too
- Simplifies the display while providing accurate availability signal
- Avoids cluttering the card with multiple section type totals

**Why aggregate total instead of per-section?**
- Users want to know if the course has seats, not specific section details
- Collapsed card should show high-level overview
- Per-section details are available when card is expanded
- Aggregation answers the key question: "Can I enroll in this course?"

**Why position with metadata badges?**
- Semantically correct: seat count is course metadata like credits and grading
- Doesn't crowd Row 1 (course code + search buttons + action buttons)
- Natural grouping with other course properties
- Consistent visual hierarchy

**Why "Available Seats" text instead of just "Available"?**
- Course cards have more horizontal space than section cards
- Explicit text is clearer for users ("Available Seats" vs ambiguous "Available")
- Matches the conversational tone of the UI
- Reduces cognitive load (no need to infer what number means)

### Badge Display Locations

**Desktop Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ [CSCI3320] [Outline] [Reviews] [Past Papers]     [Actions] │
│ Computer Graphics                                           │
│ [2 credits] [Graded] [45/200 Available Seats] [Instructors]│
└─────────────────────────────────────────────────────────────┘
```

**Mobile Layout:**
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

Shown in metadata row after credits and grading basis badges, before instructor filters.

### Edge Cases

**No data available:**
- Badge not shown if no term data exists
- Badge not shown if no sections exist for the term
- Returns null from `getAggregateSeatInfo()`

**Zero seats available:**
- Badge still shown with red styling
- Indicates course is closed/full
- Users can still view sections when expanding card

**Multiple section types:**
- Only shows data for primary type (first in the raw data order)
- Raw data is assumed to be ordered by priority (typically LEC first, then TUT, LAB, etc.)
- Uses whichever section type appears first in the course data

---

## Filtering System

### Instructor Filters

**Display:**
- Badge-style toggle buttons for each instructor
- "Clear Instructors" button when filters active
- Shown below metadata badges

**Behavior:**
- Multiple selection allowed (Set-based state)
- Filters sections by instructor name
- Updates available sections dynamically

### Day Filters

**Display:**
- Only shown when card is expanded
- Only shows days that have courses available
- Mon, Tue, Wed, Thu, Fri buttons

**Behavior:**
- Multiple selection allowed
- Filters sections by meeting days
- Updates visible sections in real-time

### Section Type Filters

**Display:**
- "Show All [Type]" links for collapsed section types
- Automatically expands when needed

**Behavior:**
- By default shows limited sections per type
- Click "Show All" to expand
- State managed per section type

---

## Props and Event Handlers

**Main Props:**
- `courseEnrollments` - Currently enrolled courses
- `onAddCourse` - Add course to shopping cart
- `onRemoveCourse` - Remove course from cart
- `onUpdateCourse` - Update section selections
- `currentTerm` - Active term filter
- `searchResults` - Filtered course list
- `onScrollToCart` - Scroll to course in cart
- `onDataUpdate` - Background data sync callback

**CourseCard Props:**
- `course` - Course data object
- `isAdded` - Whether course is in cart
- `initialSelections` - Initial section selections
- All event handlers passed through

---

## Auto-Expand Behavior

**Triggers:**
- `shouldAutoExpand` prop is true
- New search occurs (`searchSequence` changes)

**Use case:**
- When user searches for specific course
- Auto-expands sections for easier browsing
- Tracks with `searchSequence` to trigger on each search

---

## Known Issues & Limitations

**Layout:**
- Desktop layout is simple but doesn't maximize horizontal space usage
- Long titles still wrap if extremely long (rare)
- Search buttons might wrap to second line on narrow windows

**Search:**
- Bilingual search only covers English + Traditional Chinese
- No Simplified Chinese support (could add 大纲, 评价)
- Google search results depend on Google's availability in user's region

**Filtering:**
- Instructor filters don't support partial name matching
- Day filters don't show time ranges (just day presence)
- No "Clear All Filters" button for day filters

---

## Component Size

**Lines of code:** ~2000+ (includes CourseCard)

**Complexity factors:**
- Desktop vs mobile layout differences
- Section filtering logic
- Instructor filtering
- Auto-completion logic integration
- State synchronization with shopping cart

**Future considerations:**
- May benefit from splitting CourseCard into separate file
- Could extract filtering logic into custom hooks
- Search button component could be modularized

---

**Last updated:** January 2026
