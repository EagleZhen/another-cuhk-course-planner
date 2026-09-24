# ShoppingCart Component

[ShoppingCart.tsx](../../web/src/components/ShoppingCart.tsx) displays the cart and calls handlers in [page.tsx](../../web/src/app/page.tsx), which owns enrollment state. Sync and change detection live in [courseUtils.ts](../../web/src/lib/courseUtils.ts).

## Choosing Sections

A lecture choice constrains the available tutorials, but a tutorial choice does not constrain lectures. Cycling follows this section-type priority. Changing a higher-priority section can make lower-priority choices incompatible, so `handleSectionChange` uses `autoCompleteEnrollmentSections` to replace the choice and reconcile the affected sections together.

Keep `selectedSections` in priority order using `sortSectionsByPriority`. The cart displays that order and uses the first section for the course header's cohort.

## When Catalog Data Disappears

After the saved cart and complete catalog are loaded, the page syncs once per term and scrape during that page session. `syncCart` leaves the cart alone if the catalog has no data for the term.

| Missing item | What the cart does |
| --- | --- |
| Course or current term | Marks the enrollment invalid. Keeps its card, hides its sections, and excludes it from the timetable and credits. |
| Selected section | Keeps the old section in `removedSections`, called a **tombstone**. Other selected sections still feed the timetable and exports. |
| Meeting in an available section | Shows the difference until dismissed, as a changed or removed row according to the pairing rules below. |

Tombstones preserve the user's choices. If a section ID returns, sync restores it to the selected sections. The saved meeting details also survive its absence, allowing changes to be reported when it returns. Choosing an available replacement removes tombstones of the same section type.

If the whole enrollment becomes invalid, its tombstones and their acknowledgment state are preserved. Re-adding the course from search clears invalid/removal state and refreshes the course data, but retains saved meeting details for section IDs still selected.

## Hiding and Selecting Courses

Hiding a course excludes it from the timetable, conflicts, and [ICS export](weekly-calendar.md#ics-export). Sync and change detection still run for it.

A hidden valid card cannot be selected; hiding a selected valid card also deselects it. Invalid cards remain selectable, even when hidden, so Review can focus them without needing a timetable event.

## Remembering and Dismissing Changes

The timetable uses current section data. To warn users when exported calendars or saved screenshots need updating, the cart compares that data with a **snapshot**: saved section details in `lastSeenSections`.

Adding a course, changing sections, or syncing records snapshots for sections that do not already have one. Existing snapshots are kept, including those for tombstones; snapshots for sections no longer selected or retained are dropped. Dismiss replaces snapshots with current values. Reload alone therefore does not erase an outstanding change.

Older snapshots may lack dates or enrollment requirements. A missing field means “unknown,” so it does not trigger a change warning. When preserving an older snapshot, `recordSeenSections` fills missing fields from current data. Dates are filled only when the time, location, and instructor still match; otherwise the old meeting is left intact so its change can be reported.

Review tracks three kinds of change, with separate acknowledgment state:

| State | What it remembers |
| --- | --- |
| `lastSeenSections` | Section details used to detect changes in selected sections of valid enrollments. |
| `lastSeenInvalidState` | The acknowledged invalid reason; a different reason needs review again. |
| `removedSectionsAcknowledged` | Whether the enrollment's section removals were acknowledged; a newly removed section resets it. |

Tombstones need review only while the enrollment is valid and its section list is shown. Dismiss preserves their acknowledgment state while they are hidden behind an invalid card, allowing unacknowledged removals to alert when the course returns. Dismissing does not delete tombstones or change the timetable.

## Comparing Meetings

`sectionSignature` collects the details used for comparison: time, location, instructor, dates, class attributes, and enrollment requirements. Availability is excluded.

Meetings with the same time, location, and instructor share a displayed row. Their dates remain separate runs within that row. Dates still count when detecting changes; they are excluded only from the key used to combine duplicate rows.

The banner and individual rows use different comparisons:

- **Banner:** compares meetings in order to decide whether a section changed. This relies on stable source ordering; a reorder alone can trigger it.
- **Rows:** matches unchanged meetings by content, so removing one does not make later rows appear changed. If the remaining added and removed counts are equal, pairs them in order as field changes. Otherwise, shows whole added/removed rows rather than guessing pairs.

Date ranges retain the source's row boundaries. A row's date list must be consecutive weekly occurrences for the first and last dates to represent it accurately. [courseUtils.test.ts](../../web/src/lib/courseUtils.test.ts) checks this against published meetings. Combining runs across a gap would imply classes that do not exist.

## Counting Statuses and Credits

A valid course counts as:

- **Open:** at least one selected section, with every selected section open.
- **Wait List / Closed:** at least one selected section with that status. These two counts can overlap.

A valid course with only tombstones has no availability status but still contributes its stated credits.

Credits come from the course, not its sections. Sum both ends of credit ranges: section choices do not establish a single value. Invalid enrollments are excluded. Hidden valid enrollments contribute to total credits, but not visible credits.
