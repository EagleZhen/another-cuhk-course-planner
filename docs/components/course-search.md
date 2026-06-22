# CourseSearch Component

**File:** [web/src/components/CourseSearch.tsx](../../web/src/components/CourseSearch.tsx)

`CourseSearch` is the main course discovery surface. It loads published course data, applies search and filters, renders course cards, and passes selected sections back to the planner.

## What It Owns

`CourseSearch` owns:

- course-data loading from [web/public/data/](../../web/public/data/)
- external JSON validation and transformation through [validation.ts](../../web/src/lib/validation.ts)
- term, subject, day, and text-search filtering
- loading/progress UI and partial-load warnings
- `CourseCard` rendering
- search, loading, and course-view analytics through [analytics.ts](../../web/src/lib/analytics.ts)

`CourseCard` currently lives in the same file. It owns per-course display, expanded-section filtering, local section selections, and add/update/remove actions.

## Data Loading Flow

1. Read publishable subject codes from `getAllSubjectCodes()` in [subjects.ts](../../web/src/lib/subjects.ts).
2. Fetch `/data/${subject}.json` for every subject in parallel.
3. Validate and transform each successful response.
4. Track per-subject success/failure, load time, approximate size, and `scraped_at`.
5. Store loaded courses and notify the parent with the oldest scrape timestamp.
6. Send `course_data_loaded` analytics with load time, success/failure counts, total size, and slowest subject.

All publishable subject files load at startup so search and filtering stay local and responsive after the initial load.

If some subject files fail, the page shows a partial-load warning with a reload action. If no subject files load, the component logs an error.

## Loading UI

Initial `loading` is `true`, so the loading UI appears on first paint. `hasDataLoaded` prevents the empty state from showing before the first load completes.

The loading UI shows:

- current subject/progress
- loaded/total subject count and percentage
- progress bar
- loaded data size after progress has started
- phase message based on completion percentage

The loading UI does not show a remaining-time estimate because parallel request timing is too noisy to predict accurately.

## Search And Filtering Flow

Search and filtering run on the loaded course list. Filtering is scheduled asynchronously so the page can show a processing state instead of blocking.

Broad filters are applied before card-local filters:

1. term
2. subject
3. day
4. text search across course code/title/instructors
5. per-card instructor filter
6. per-card section day/type filters

Important invariants:

- Day-filter availability is calculated from courses filtered by non-day criteria first, avoiding a self-loop where selecting a day hides the controls needed to change the day filter.
- Applying an instructor filter inside a card clears section selections that no longer match the filter.
- Clearing the instructor filter keeps existing selections.

## Course Card Behavior

Collapsed cards show course identity, search actions, metadata, instructors, and aggregate seat availability.

Expanded cards show section choices and card-local filters. Local selections remain inside the card until the user adds or updates the course in the planner.

Desktop and mobile layouts are intentionally different:

- Desktop keeps course code, search actions, and planner actions dense. Course titles get their own row because long CUHK titles wrap awkwardly beside action buttons.
- Mobile stacks search actions, metadata, filters, and planner actions for readability.

When a new search sequence targets one specific result, the first card can auto-expand so the user lands directly on section choices.

## UI Signals

External search actions:

- Outline opens a Google query for `CUHK ${subject}${courseCode} Outline OR 大綱`.
- Reviews opens a Google query for `CUHK ${subject}${courseCode} Review OR 評價`.
- Past Papers opens a CUHK Library query for `${subject}${courseCode}`.

Google queries include English and Traditional Chinese because CUHK course discussion happens in both languages. `CUHK` narrows results away from other universities, and the no-space course code matches common student search behavior.

Past Papers uses CUHK Library search because it targets a different source from outline/review searches.

Seat availability:

- collapsed cards show aggregate availability for the primary section type, usually `LEC`
- per-section seats remain visible after expanding the card
- badge styling comes from `getAvailabilityBadgeStyle()` in [courseUtils.ts](../../web/src/lib/courseUtils.ts)
- availability is scraped manually, not real-time; students should verify in CUSIS before enrolling

The primary section type is used as a compact overview because it is usually the enrollment bottleneck.

## Known Limitations

- Startup loading fetches all subjects instead of loading on demand.
- `CourseSearch.tsx` is large because `CourseCard` and several subviews still live in the same file.
- Google search buttons depend on Google availability in the user's region.
- Bilingual search covers English and Traditional Chinese, not Simplified Chinese.
- Instructor filters do not support partial name matching.
- Day filters show day presence, not time ranges.

## Related Docs

- [Data pipeline](../data-pipeline.md) - where `/data/*.json` files come from
- [Deployment](../deployment.md) - static hosting and analytics context
