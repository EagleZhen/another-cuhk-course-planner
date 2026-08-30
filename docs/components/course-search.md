# CourseSearch Component

**File:** [web/src/components/CourseSearch.tsx](../../web/src/components/CourseSearch.tsx)

The course discovery surface: filters the published course catalog and passes selected sections to the planner. `CourseCard` and several subviews live in the same file.

Only non-obvious constraints and rationale are documented here; the code is the reference for behavior.

## Data Loading

- A year's subjects all load in parallel so search stays local and instant within it. The live year loads at startup; an archived year is fetched only when first opened, so the live year never pays for years no one visits. Complete loads are cached per year; an incomplete one retries when that year next becomes active. Implemented in [`useCourseCatalog`](../../web/src/hooks/useCourseCatalog.ts).
- **Mobile first visit:** loading waits for the `NOTICE_IMAGE_LOADED_EVENT` window event so the `MobileDesktopNotice` preview image isn't starved by the course-data download (~4MB compressed on the wire, ~40MB of JSON after decompression). The notice dispatches it on image load, image error, and dismissal — loading must never hang on a missing dispatch. Constants live in [constants.ts](../../web/src/lib/constants.ts).
- The loading UI deliberately shows no remaining-time estimate: parallel request timing is too noisy to predict honestly.

## Filtering

Course-level filtering lives in [courseFilters.ts](../../web/src/lib/courseFilters.ts) as composable predicate builders; `CourseSearch` only supplies state and presentation (shuffle, result limit). Routing every caller through this one engine keeps the results and chip-filter options from drifting apart.

- **Criteria vs. context.** `criteria` is user selections (empty = no constraint); `context` is the ambient scope (the term and current enrollments). Keeping ambient data in `context` lets `hasActiveFilters` stay a pure test of whether the user narrowed anything — which drives the 10-vs-100 result cap.
- **Keyword search** covers code, title, and current-term instructors via one shared `courseMatchesKeyword`. Instructors match both the scraped and the displayed form of a name. Course descriptions are display content, not a matching field; they can mention prerequisites or related courses that are not the course the user searched for.
- **Chip-filter options** (days, credits, numeric level, and career) come from `availableValues`: values present after every _other_ filter, plus the current selection. Excluding the own dimension avoids a self-loop; keeping the selection stops a selected chip vanishing (which would leave results you can't clear).
- **Numeric level** comes from the course code's first digit (1–9) and counts as an active filter. Codes without a valid leading digit contribute no level chip.
- **Career** defaults to `Undergraduate` and is excluded from `hasActiveFilters`: it picks _which_ catalog you browse, so it does not switch off the shuffled 10-course landing.
- **No-conflict filtering** keeps a course when at least one complete, cohort-compatible section combination avoids both internal clashes and the visible, valid planner baseline. The course under test is removed from its own baseline; hidden and invalid enrollments do not block it.
- **Active-filter summary.** Removable grouped pills stay visible for empty filtered results and are the only filter cue once the panel collapses; each ✕ clears its whole dimension. Unlike `hasActiveFilters` (which ignores career), the summary includes any chosen career, including the default `Undergraduate`.
- **Empty filtered results** keep the user's selections visible and point back to the removable summary; the generic no-data state is reserved for an unnarrowed catalog.
- The supported career list is explicit. A Vitest contract test ensures it covers every value in published course data, so a new source value requires an intentional UI decision.
- **Adding a filter** (see credits for the full pattern):
  - _Engine_ (`courseFilters.ts`): a predicate builder keyed in `BUILDERS`, its `criteria` field (usually also in `hasActiveFilters` — career is the exception), and — for a chip filter — a `ChipDimension`.
  - _Component_ (`CourseSearch`): state + toggle, the `filterCriteria` field, an `availableValues` memo, and a `ChipFilterRow`.
- **Instructor filter:** pills and section matching share one compact-name list, so they compare as displayed. Applying the filter clears section selections that no longer match; clearing it keeps existing selections.
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
