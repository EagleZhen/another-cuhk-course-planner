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

## Known Limitations

- Google search buttons depend on Google availability in the user's region.
- Bilingual search covers Traditional but not Simplified Chinese.
- Instructor filters do not support partial name matching.
- Day filters show day presence, not time ranges.
- File size and startup loading are tracked in [improvements.md](../improvements.md).
