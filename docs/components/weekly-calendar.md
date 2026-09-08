# WeeklyCalendar Component

**File:** [web/src/components/WeeklyCalendar.tsx](../../web/src/components/WeeklyCalendar.tsx)

Renders one week of the timetable from precomputed `CalendarEvent[]` (state and conflict computation live in [page.tsx](../../web/src/app/page.tsx), see [architecture.md](../architecture.md)). Also owns the calendar exports: screenshot, ICS download, and ICS undo. Layout constants and day mappings come from [calendarConfig.ts](../../web/src/lib/calendarConfig.ts); overlap grouping, column placement and week selection come from [calendarLayout.ts](../../web/src/lib/calendarLayout.ts).

Only non-obvious constraints and rationale are documented here; the code is the reference for behavior.

## Weeks

One event per **occurrence** — a section's class on one date — not per meeting row. Of course-terms with a timed section, **70.5%** have one that skips a week and **16.4%** one that meets somewhere or sometime different in another week. A union view can show neither.

- **The range comes from the cart**, first occurrence to last — never a term calendar, so term boundaries never come up here.
- **Contiguous:** an empty week stays in the range and says "No classes this week" rather than being skipped.
- **Default week:** the week containing today, clamped to the range. No other rule.
- **Columns and hours span every week**, not the shown one, so paging does not shift the grid.
- **The shown week is derived, not stored**, so a cart or term change cannot strand it.
- **No "all weeks" mode**, deliberately: it would misread most carts and need a second conflict model.

### Dates

Dates are scraped as `d/m` with no year. **The weekday supplies it:** a day/month falls on the stated weekday in only one of the term's two calendar years, so `Mo` + `25/8` in `2025-26 Term 1` can only be 2025.

So a date matching neither year contradicts itself and is dropped with a warning, never guessed. Candidates are the term's own two and no wider: every published date resolves inside them, and each extra candidate gives a wrong weekday another chance to match.

No month rule can work — August is the first year in Term 1 and the second in the Summer Session. The one this replaced misdated 232 dates.

A test expands every published timed meeting on each run, so a future term falling outside its own two years fails there rather than quietly dropping classes.

## Noticing What Changes

Accuracy does not help a student who never looks. A median 13-week cart holds only 5 distinct weeks, so paging one week at a time shows nothing new eight times.

- **Repeated weeks are skipped** by default: a chevron steps to the nearest week showing something this one does not, and a dead one says on hover why. A cart that never varies disables both, which is itself the signal.
- **The step is relative to where you stand**, not to a precomputed list of run boundaries — from inside a run those land on the run's own first week and change nothing on screen. It also removes any need for a preferred week: if nothing differs, there is simply no move, so no step can strand you.
- **A card breathes on arrival** when it was not on the timetable you last saw. One comparison and no exceptions: a room change, a section swapping type, a class back from a break all read alike, and so does travelling either way. Content is time, location and instructor — language sits on the section, so it cannot vary by week.
- **Do not carve out resumptions.** Two earlier versions suppressed them to keep the cue rare, and each carve-out marked going one way and not the other. It costs less than it looks: silencing them takes arrivals that ring from 28% to 7%, but `GEWS1011` swapping its lecture for ten tutorials falls in the gap.
- **Nothing ringing means something left.** With repeats skipped you always land on a different week, but a class that stops leaves no card to mark.
- **The cue expires** (`CHANGED_HIGHLIGHT_MS`) and is cleared before a capture renders — it is navigation state, not schedule content. Clearing alone is not enough: the capture reads live DOM after React batches, so it waits a frame.

## Finding A Conflict

A clash can occupy one week of thirteen while the cart reports it all term — `MBTE3510` and `BECE4020` clash on 2 November alone — so the badge says there is a problem and the grid shows none.

**"Review next conflict" appears only when the week on screen is clear and another is not**, the one state where the two disagree. Showing it whenever any week clashed is the obvious rule and wrong: of conflicted carts, 66% clash in _every_ week and 30% in nine of ten, so it would duplicate the `next week` chevron almost always.

It ignores the skip toggle: where the clash is and which weeks are worth stepping through are different questions.

## Layout

- **Dynamic hour height:** the grid is scaled so a 45-minute event (`MINIMUM_COURSE_DURATION_MINUTES`, the shortest CUHK class) exactly fits the rows enabled in the display config. Hardcoding card or slot heights breaks the guarantee that the shortest class can show every enabled row.
- **Minimum day width:** day columns share available space but stop shrinking at 128px; narrower viewports scroll horizontally.
- **Bounded wrapping:** locations and instructors may use a second line only when the meeting duration already provides enough card height.
- **Single scroll container:** one element owns both axes to avoid duplicate horizontal scrollbars.
- **Screenshot width:** exports use at least 800px and expand for seven-day calendars, independent of viewport width.
- **Z-index ladder:** sticky day header `z-50`, selected card `z-40`, conflict stacks `z-2x`, dropdown menus `z-[60]` (must clear the sticky header). Changing one requires checking the others.
- **Overlapping cards fan rightwards, last on top.** Do not invert it: the strips left showing are each buried card's left edge, where the text is, so they read as cards rather than blank slivers. Every card in a stack shares one width, so exactly one is fully readable either way.
- **Zones span a whole overlap chain; columns come from real overlap.** Two cards linked only through a third share one zone rather than drawing two that overlap, while the chain's ends share a column instead of the stack marching rightwards.

## ICS Export

- Exports only visible, valid enrollments — the visibility toggle silently doubles as an export filter.
- Times are parsed as `Asia/Hong_Kong` and exported as UTC, so exchange students in other timezones get correct local times.
- UIDs are deterministic (course + section + date + time), so re-importing an export overwrites events instead of duplicating them.
- Export is per-occurrence and always was; the on-screen timetable now matches it. UIDs carry the date, so correcting a year rewrites them — anyone who imported a misdated August event cannot undo it with a corrected export.

## ICS Undo

- The file picker must open directly from the click (browser user-activation rule), so the confirmation dialog runs _after_ file selection. Reordering it to confirm-first breaks the file chooser.
- Undo adds `STATUS:CANCELLED` to each event via string replacement, not a full ICS parse, preserving the file's CRLF/LF style.
- A foreign `PRODID` triggers a warning but is allowed — the user may legitimately want to cancel a renamed or re-exported file.
- Deterministic export UIDs are what make the undo file match its original import.

## Known Limitations

- Fields in 45-minute cards stay single-line; wrapped fields clamp after two lines.
- Desktop and mobile header layouts duplicate the ICS split-button markup within the file.
- User dialogs are native `alert`/`confirm` rather than styled modals (deliberate simplicity).
