# WeeklyCalendar Component

**File:** [web/src/components/WeeklyCalendar.tsx](../../web/src/components/WeeklyCalendar.tsx)

Renders the visual timetable from precomputed `CalendarEvent[]` (state and conflict computation live in [page.tsx](../../web/src/app/page.tsx), see [architecture.md](../architecture.md)). Also owns the calendar exports: screenshot, ICS download, and ICS undo. Layout constants and day mappings come from [calendarConfig.ts](../../web/src/lib/calendarConfig.ts).

Only non-obvious constraints and rationale are documented here; the code is the reference for behavior.

## Layout

- **Dynamic hour height:** the grid is scaled so a 45-minute event (`MINIMUM_COURSE_DURATION_MINUTES`, the shortest CUHK class) exactly fits the rows enabled in the display config. Hardcoding card or slot heights breaks the guarantee that the shortest class can show every enabled row.
- **Minimum day width:** day columns share available space but stop shrinking at 128px; narrower viewports scroll horizontally.
- **Bounded wrapping:** locations and instructors may use a second line only when the meeting duration already provides enough card height.
- **Single scroll container:** one element owns both axes to avoid duplicate horizontal scrollbars.
- **Screenshot width:** exports use at least 800px and expand for seven-day calendars, independent of viewport width.
- **Z-index ladder:** sticky day header `z-50`, selected card `z-40`, conflict stacks `z-2x`, dropdown menus `z-[60]` (must clear the sticky header). Changing one requires checking the others.

## ICS Export

- Exports only visible, valid enrollments — the visibility toggle silently doubles as an export filter.
- Times are parsed as `Asia/Hong_Kong` and exported as UTC, so exchange students in other timezones get correct local times.
- UIDs are deterministic (course + section + date + time), so re-importing an export overwrites events instead of duplicating them.
- Meeting dates are scraped as `d/m` with no year; the calendar year is inferred from the term name (Sep–Dec = first year of the academic year, Jan–Aug = second).

## ICS Undo

- The file picker must open directly from the click (browser user-activation rule), so the confirmation dialog runs _after_ file selection. Reordering it to confirm-first breaks the file chooser.
- Undo adds `STATUS:CANCELLED` to each event via string replacement, not a full ICS parse, preserving the file's CRLF/LF style.
- A foreign `PRODID` triggers a warning but is allowed — the user may legitimately want to cancel a renamed or re-exported file.
- Deterministic export UIDs are what make the undo file match its original import.

## Known Limitations

- Fields in 45-minute cards stay single-line; wrapped fields clamp after two lines.
- Desktop and mobile header layouts duplicate the ICS split-button markup within the file.
- User dialogs are native `alert`/`confirm` rather than styled modals (deliberate simplicity).
