# ShoppingCart Component

[ShoppingCart.tsx](../../web/src/components/ShoppingCart.tsx) renders enrollment state owned by [page.tsx](../../web/src/app/page.tsx). Reconciliation and change detection live in [courseUtils.ts](../../web/src/lib/courseUtils.ts).

## Section Selection

Cycling alternatives are constrained by higher-priority selections only: a lecture constrains tutorial choices, never the reverse. Changing a higher-priority section can invalidate lower-priority picks, so `handleSectionChange` uses `autoCompleteEnrollmentSections` to reconcile them together.

`selectedSections` must stay in section-type priority order. The cart renders that order and treats the first section as primary; use `sortSectionsByPriority` when building the array.

Hidden valid cards cannot be selected; hiding a selected valid card deselects it. Invalid cards remain selectable so Review can focus them even though they have no timetable events.

## Enrollment Lifecycle

Once the complete catalog is ready, the page syncs the restored cart once per term and scrape. Missing data has different consequences depending on what disappeared:

| Missing item | Result |
| --- | --- |
| Course or current term | Enrollment becomes invalid, is excluded from timetable and credits, and stays in the cart. Its section list is hidden. |
| Selected section | Preserved in `removedSections` as a tombstone. Remaining live sections still feed the timetable and exports. |
| Meeting in a live section | Appears as a removed meeting row while its change is unacknowledged. |

Tombstones preserve the user's picks so sync can restore them if their IDs return. Their meeting snapshots are retained too, allowing changes made during their absence to be reported. A replacement section removes tombstones of the same type.

Going invalid preserves tombstones and their acknowledgment state. Re-adding from search clears invalid/removal state and refreshes the course, but retains snapshots for section IDs still present.

Visibility is independent of this lifecycle. Hiding a course excludes it from the timetable, conflicts, and ICS export; reconciliation and change detection continue. See [ICS export](weekly-calendar.md#ics-export).

## Change Detection and Acknowledgment

The timetable uses current section data. `lastSeenSections` records the comparison baseline so changes can warn users to update exported calendars or saved screenshots.

- Add, section changes, and sync seed missing snapshots without overwriting existing ones. Dismiss replaces them with current values, so reload alone does not erase an outstanding change.
- Older snapshots may lack dates or enrollment requirements. Absence means unknown, not a change. Sync fills those fields; dates are filled only for matching meeting rows, preserving real differences.
- Review includes section changes, unseen invalid reasons, and unacknowledged tombstones. Dismiss preserves acknowledgment state for tombstones hidden behind an invalid card, so they can alert when the course returns.

Keep the three acknowledgment states distinct: `lastSeenSections` tracks section details, `lastSeenInvalidState` tracks the invalid reason, and `removedSectionsAcknowledged` tracks tombstones. A newly removed section resets tombstone acknowledgment.

## Meeting Comparison and Dates

Section signatures compare time, location, instructor, dates, class attributes, and enrollment requirements; availability is excluded.

Meetings with the same time, location, and instructor share a displayed row. Dates are compared for changes but excluded from the deduplication key, allowing separate weekly runs to appear together without repeating the other fields.

The summary comparison is positional. Detail rows instead compare content, so removing one meeting does not mark every later row as changed. Equal added/removed counts are paired positionally for field-level changes; unequal counts remain whole added/removed rows rather than guessing a correspondence.

Date ranges preserve the source's row boundaries. Each published row must be one consecutive weekly run for its first and last dates to represent it accurately. `courseUtils.test.ts` checks that invariant against published meetings; combining runs across gaps would imply classes that do not exist.

## Summary Counts

A course counts as Open only with at least one live section and every live section open. Any live section on Wait List or Closed puts the course in that category, so those counts can overlap. A course with only tombstones has no availability status but still contributes credits unless invalid.

Credits come from the course, not its sections. Preserve credit ranges when summing: section choices do not establish a single value. Invalid enrollments are excluded; hidden valid enrollments still contribute to total credits, but not visible credits.
