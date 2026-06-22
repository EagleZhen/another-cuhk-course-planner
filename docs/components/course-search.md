# CourseSearch Component

**File:** [web/src/components/CourseSearch.tsx](../../web/src/components/CourseSearch.tsx)

`CourseSearch` is the main course discovery surface. It loads published course data, applies search and filters, renders course cards, and passes selected sections back to the planner.

## Responsibilities

`CourseSearch` owns:

- loading course JSON from [web/public/data/](../../web/public/data/)
- transforming external JSON through [validation.ts](../../web/src/lib/validation.ts)
- search, subject, and day filtering
- loading/progress UI and partial-load warnings
- rendering `CourseCard` rows
- sending search/loading/course-view analytics through [analytics.ts](../../web/src/lib/analytics.ts)

`CourseCard` still lives in the same file. It owns per-course display, instructor/day/section filtering inside an expanded card, local section selections, and add/remove/update actions.

## Data Loading

The component loads all publishable subjects from `getAllSubjectCodes()` in [subjects.ts](../../web/src/lib/subjects.ts), then fetches `/data/${subject}.json` for each subject in parallel.

Loading records:

- per-subject success/failure
- approximate data size
- per-subject load time
- oldest `scraped_at` timestamp across loaded files

When loading finishes, `course_data_loaded` is sent to PostHog with total load time, success/failure counts, total size, and slowest subject. This answers whether startup loading is slow or unreliable for real users.

If some subject files fail to load, the page shows a partial-load warning with a reload action. If no subject files load, the component logs an error.

## Loading UI

Initial `loading` state is `true`, so the loading UI renders immediately on first paint. `hasDataLoaded` prevents an empty-state message from appearing before the first load completes.

The loading UI shows:

- current subject/progress
- loaded/total subject count and percentage
- progress bar
- loaded data size after progress has started
- phase message based on completion percentage

The remaining-time estimate was removed; the current UI avoids pretending it can predict parallel request timing precisely.

## Search And Filters

Search runs on the already-loaded course list. Filtering is scheduled asynchronously so the UI can show a processing state instead of blocking the page.

Filter layers:

- term filter
- parent-level subject filter
- day filter
- text search across course code/title/instructors
- per-card instructor filter
- per-card section day/type filters

Day-filter availability is calculated from courses filtered by non-day criteria first. This avoids a self-loop where selecting a day would hide the controls needed to change the day filter.

When an instructor filter is applied inside a card, section selections that no longer match the filter are cleared. Clearing the instructor filter keeps existing selections.

## Course Cards

Cards have separate desktop and mobile layouts. Desktop keeps code/search/actions dense while giving the course title its own row. Mobile stacks metadata and actions for readability.

The title gets its own row because long CUHK titles wrap awkwardly when sharing horizontal space with action buttons.

When a new search sequence targets a specific single result, the first card can auto-expand so the user lands directly on sections.

## External Search Buttons

Each course card has three external search actions:

- Outline: Google query for `CUHK ${subject}${courseCode} Outline OR 大綱`
- Reviews: Google query for `CUHK ${subject}${courseCode} Review OR 評價`
- Past Papers: CUHK Library query for `${subject}${courseCode}`

The Google queries include both English and Traditional Chinese because CUHK course discussion happens in both languages. `CUHK` narrows results away from other universities, and the no-space course code matches how students commonly search for courses.

Past Papers uses the CUHK Library search helper instead of Google because it targets a different source with a simpler course-code query.

## Seat Availability Badge

Collapsed cards show aggregate availability for the primary section type, usually `LEC`, using `getAggregateSeatInfo()` in [courseUtils.ts](../../web/src/lib/courseUtils.ts).

The badge is an overview only:

- primary section type is treated as the enrollment bottleneck
- per-section seats remain visible after expanding the card
- data is scraped manually, not real-time
- students should still verify availability in CUSIS before enrolling

Badge color comes from `getAvailabilityBadgeStyle()`:

- red: closed or 0 seats
- orange: waitlisted
- yellow: 10 or fewer seats
- green: more than 10 seats

## Known Limitations

- All subjects load at startup instead of on demand.
- `CourseSearch.tsx` is large because `CourseCard` and several subviews still live in the same file.
- Google search buttons depend on Google availability in the user's region.
- Bilingual search covers English and Traditional Chinese, not Simplified Chinese.
- Instructor filters do not support partial name matching.
- Day filters show day presence, not time ranges.

## Related Docs

- [Data pipeline](../data-pipeline.md) - where `/data/*.json` files come from
- [Deployment](../deployment.md) - static hosting and analytics context
