# CourseSearch Component

**File:** [web/src/components/CourseSearch.tsx](../../web/src/components/CourseSearch.tsx)

The course discovery surface: loads published course data from [web/public/data/](../../web/public/data/) through the [validation.ts](../../web/src/lib/validation.ts) boundary, filters it, and passes selected sections to the planner. `CourseCard` and several subviews live in the same file.

Only non-obvious constraints and rationale are documented here; the code is the reference for behavior.

## Data Loading

- A year's subjects all load in parallel so search stays local and instant within it. The current year (`CURRENT_ACADEMIC_YEAR`) loads at startup; switching to an archived year fetches that year on demand and merges it in. Each year loads at most once per session, so an archived year costs a fetch only when first opened and the live year never pays for years no one visits.
- **Mobile first visit:** loading waits for the `NOTICE_IMAGE_LOADED_EVENT` window event so the `MobileDesktopNotice` preview image isn't starved by the course-data download (~4MB compressed on the wire, ~40MB of JSON after decompression). The notice dispatches it on image load, image error, and dismissal — loading must never hang on a missing dispatch. Constants live in [constants.ts](../../web/src/lib/constants.ts).
- The loading UI deliberately shows no remaining-time estimate: parallel request timing is too noisy to predict honestly.

## Filtering

Course-level filtering lives in [courseFilters.ts](../../web/src/lib/courseFilters.ts) as composable predicate builders; `CourseSearch` only supplies state and the presentation around it (shuffle, result limit). It is the single source of truth — before, the result filter and the day-option list each re-implemented the predicates and had drifted, disagreeing on whether search matched `description`.

- **Criteria vs. context.** `criteria` holds user selections, where empty means no constraint; `context` holds the ambient scope (the term now, the planned timetable later for conflict filtering). The split keeps `hasActiveFilters` — which chooses the 10-vs-100 result cap — a pure function of user selections: the term is always set, so it must not count as the user narrowing anything.
- **Keyword search** matches course code, title, description, and instructors through one shared `courseMatchesKeyword`, so results and the day-option chips can't disagree again.
- **Day-filter options** come from `filterCoursesExceptDays` — courses filtered by everything except the day filter. Computing them after the day filter creates a self-loop: selecting a day hides the controls needed to change it.
- **Adding a filter** is one predicate builder plus one `criteria` field; `filterCourses` composes whatever is active.
- **Instructor filter:** applying it clears section selections that no longer match; clearing it keeps existing selections.
- **Card-local selections** stay inside the card until the user adds or updates the course in the planner.

## External Search Buttons

- Queries are built deliberately: `CUHK` narrows away other universities, and the no-space course code (`CSCI3100`) matches how students actually search.
- Queries are bilingual (`Outline OR 大綱`, `Review OR 評價`) because CUHK course discussion happens in English and Traditional Chinese.
- Past Papers searches the CUHK Library, not Google — different source.

## Seat Availability

- Collapsed cards show the primary section type only (usually LEC) because it is usually the enrollment bottleneck.
- Availability is scraped, not real-time; students should verify in CUSIS.

## Sticky Action Buttons While Expanded

Cart action buttons scrolled out of view on long section lists. Fix: dock them below the search bar via plain CSS `sticky` (like the search bar itself). JS only computes the `top` offset - it plays no part in the pinning itself.

- **Desktop** sticks the whole `CardHeader` (already a sibling of `CardContent`, so no restructuring needed) rather than pulling the buttons out of their inline spot beside the title.
- **Mobile** sticks only a slim button bar, not the full header - badges/instructor chips can wrap several lines on a narrow screen.
- **No `IntersectionObserver`-based "is it stuck" detection** (e.g. for a shadow that appears only once pinned) - it lags real scroll position by a frame, causing a visible mismatch. Styling keys off `expanded` alone instead.
- z-index stays below the search bar's, so the search bar always wins on overlap.
- The offset is reconstructed from the search bar's CSS `top` (read via `getComputedStyle`, not hardcoded) plus its live height (via `ResizeObserver`) - **not** `getBoundingClientRect()`'s current position. The search bar's on-screen position only equals its _stuck_ position once the page has actually scrolled that far; expanding a card before scrolling (e.g. the first result, on a wide screen with more content above the search bar) would otherwise capture wherever it naturally sits pre-scroll, sticking the header far down the page.
- Desktop's `top` offset sits a few px past that, filled with a hard-edged `box-shadow` (not padding, which would jump the instant a card expands rather than only once actually stuck).

## Known Limitations

- Google search buttons depend on Google availability in the user's region.
- Bilingual search covers Traditional but not Simplified Chinese.
- Instructor filters do not support partial name matching.
- Day filters show day presence, not time ranges.
- File size and startup loading are tracked in [improvements.md](../improvements.md).
