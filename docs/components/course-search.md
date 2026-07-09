# CourseSearch Component

**File:** [web/src/components/CourseSearch.tsx](../../web/src/components/CourseSearch.tsx)

The course discovery surface: loads published course data from [web/public/data/](../../web/public/data/) through the [validation.ts](../../web/src/lib/validation.ts) boundary, filters it, and passes selected sections to the planner. `CourseCard` and several subviews live in the same file.

Only non-obvious constraints and rationale are documented here; the code is the reference for behavior.

## Data Loading

- A year's subjects all load in parallel so search stays local and instant within it. The current year (`CURRENT_ACADEMIC_YEAR`) loads at startup; switching to an archived year fetches that year on demand and merges it in. Each year loads at most once per session, so an archived year costs a fetch only when first opened and the live year never pays for years no one visits.
- **Mobile first visit:** loading waits for the `NOTICE_IMAGE_LOADED_EVENT` window event so the `MobileDesktopNotice` preview image isn't starved by the course-data download (~4MB compressed on the wire, ~40MB of JSON after decompression). The notice dispatches it on image load, image error, and dismissal — loading must never hang on a missing dispatch. Constants live in [constants.ts](../../web/src/lib/constants.ts).
- The loading UI deliberately shows no remaining-time estimate: parallel request timing is too noisy to predict honestly.

## Filtering

- **Day-filter options** are computed from courses filtered by everything _except_ the day filter. Computing them after creates a self-loop: selecting a day hides the controls needed to change it.
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

Cart action buttons scrolled out of view on long section lists. Fix: dock them below the search bar via plain CSS `sticky` (like the search bar itself). JS (a `ResizeObserver`) only tracks the search bar's live position for the `top` offset - it plays no part in the pinning itself.

- **Desktop** sticks the whole `CardHeader` (already a sibling of `CardContent`, so no restructuring needed) rather than pulling the buttons out of their inline spot beside the title.
- **Mobile** sticks only a slim button bar, not the full header - badges/instructor chips can wrap several lines on a narrow screen.
- **No `IntersectionObserver`-based "is it stuck" detection** (e.g. for a shadow that appears only once pinned) - it lags real scroll position by a frame, causing a visible mismatch. Styling keys off `expanded` alone instead.
- z-index stays below the search bar's, so the search bar always wins on overlap.
- Desktop's `top` offset sits a few px past the search bar's height, filled with a hard-edged `box-shadow` (not padding, which would jump the instant a card expands rather than only once actually stuck).

## Known Limitations

- Google search buttons depend on Google availability in the user's region.
- Bilingual search covers Traditional but not Simplified Chinese.
- Instructor filters do not support partial name matching.
- Day filters show day presence, not time ranges.
- File size and startup loading are tracked in [improvements.md](../improvements.md).
