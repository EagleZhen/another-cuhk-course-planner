# ShoppingCart Component

**File:** [web/src/components/ShoppingCart.tsx](../../web/src/components/ShoppingCart.tsx)

Lists enrolled courses with section details, availability, conflicts, and per-course actions (hide, remove, cycle sections). State lives in [page.tsx](../../web/src/app/page.tsx); the cart renders it and raises handlers.

Only non-obvious constraints and rationale are documented here; the code is the reference for behavior.

## Section Cycling

- Cycling alternatives are constrained by **higher-priority selections only** (e.g., the selected LEC constrains TUT choices, never the reverse). Cycling a high-priority section may invalidate lower ones — that is reconciled by the parent's `handleSectionChange`, which runs `autoCompleteEnrollmentSections` rather than swapping one section in place.
- A section with no compatible alternatives shows an "only option" badge instead of cycling controls.

## Visibility and Selection

- Hidden cards are not selectable; hiding a currently selected course also deselects it. Invalid cards remain selectable in the cart, but have no timetable events.
- Visibility is not just cosmetic: it feeds calendar conflict detection and ICS export (see [weekly-calendar.md](weekly-calendar.md#ics-export)).

## Enrollment Lifecycle

Sync (`syncEnrollment` in [courseUtils.ts](../../web/src/lib/courseUtils.ts)) reconciles every enrollment against each fresh scrape. An enrollment is in one of three states:

| State | When | Consequences |
| --- | --- | --- |
| Valid | course, term, and every picked section exist | fully counted |
| Valid + tombstones | course/term exist, some picked sections don't (`removedSections`) | live sections still feed the timetable, conflicts, and ICS; tombstones render struck-through with replacement arrows, or a search/remove hint when no alternatives exist; with zero live sections the course appears in no status count |
| Invalid | course or current term gone | amber card with reason + last-synced time replaces the section list (hiding any tombstones); excluded from timetable and credits; stays until the user removes it |

Transitions and acknowledgment:

- Sync tombstones a vanished pick and restores it to live if its id reappears. `removedSectionsAcknowledged` resets only when a _new_ tombstone appears.
- Going invalid preserves tombstones and acknowledgments, so a course that returns resumes where it left off.
- Choosing a replacement via a tombstone's arrows selects a live section of that type, which prunes the tombstone (`pruneReplacedTombstones`).
- The Review banner (`getChangedCourseIds`) queues unseen invalid reasons, unacknowledged visible tombstones, and section-detail changes. **Dismiss all** acknowledges only what is visible: tombstones hidden behind an invalid card stay unacknowledged, so they re-alert once the course returns and they can actually be seen.
- Re-adding from search (`updateExistingEnrollment`) is the full reset: clears invalid state, tombstones, and acknowledgments, and refreshes the stale `course`.

`isVisible` (the eye toggle) is orthogonal: a hidden course leaves the timetable and ICS but its lifecycle keeps running. See [architecture.md](../architecture.md#browser-state).

## Change Detection

Flags an enrolled section that changed (time, location, instructor, or language) since the user last saw it, so they know to re-export their `.ics` or update a saved screenshot — which the app can't do for them.

- The rendered timetable is always the fresh scrape. What the user _last saw_ is kept as an invisible per-section signature (`lastSeenSections` on `CourseEnrollment`); a section whose current signature differs is surfaced as changed.
- That signature advances only on add / section-change / sync / dismiss — never on plain reload — so a note persists across reloads until dismissed and re-fires on further change. Sync only fills in _missing_ signatures, so fresh data the user hasn't seen yet isn't retroactively flagged.
- Compares time + location + instructor + language; ignores `dates` and availability; only `selectedSections`. Detection compares meeting positions to decide whether to show the summary banner; detail rows use content-based set differences so a deletion does not make later meetings look changed. Logic lives in [courseUtils.ts](../../web/src/lib/courseUtils.ts) (`sectionSignature`, `diffEnrollment`, `diffSectionDetail`).
- Equal added/removed counts pair positionally into field-level "previously" highlights; unequal counts show whole rows as added/removed rather than guessing pairs — a wrong before/after is worse than none.
- A whole course or current term disappearing uses `isInvalid`; a selected section becomes a tombstone; a meeting disappearing from a live section stays in that section as a removed row.

## Summary Semantics

- A course counts as **Open** only when _every_ selected section is open, but as **Waitlisted**/**Closed** when _any_ section is. The asymmetry is deliberate: one problematic section blocks clean enrollment.
- Credit totals exclude invalid enrollments; all counts split into visible/total when some courses are hidden.

## Section Ordering

- Rows render in `selectedSections` order, and the first element is the primary section — so the array must stay in section-type priority order (LEC before TUT). Build paths don't guarantee that order, so they normalize through `sortSectionsByPriority`. Fixes [issue #58](https://github.com/EagleZhen/another-cuhk-course-planner/issues/58).
