# ShoppingCart Component

**File:** [web/src/components/ShoppingCart.tsx](../../web/src/components/ShoppingCart.tsx)

Lists enrolled courses with section details, availability, conflicts, and per-course actions (hide, remove, cycle sections). State lives in [page.tsx](../../web/src/app/page.tsx); the cart only renders it and raises handlers.

Only non-obvious constraints and rationale are documented here; the code is the reference for behavior.

## Section Cycling

- Cycling alternatives are constrained by **higher-priority selections only** (e.g., the selected LEC constrains TUT choices, never the reverse). Cycling a high-priority section may invalidate lower ones — that is reconciled by the parent's `handleSectionChange`, which runs `autoCompleteEnrollmentSections` rather than swapping one section in place.
- A section with no compatible alternatives shows an "only option" badge instead of cycling controls.

## Visibility and Selection

- Hidden and invalid cards are not selectable; hiding a currently selected course also deselects it.
- Visibility is not just cosmetic: it feeds calendar conflict detection and ICS export (see [weekly-calendar.md](weekly-calendar.md#ics-export)).

## Invalid Enrollments

- Invalid courses (marked by background sync) are rendered in orange with the reason and last-synced time, not deleted — the user decides whether to remove them. See [architecture.md](../architecture.md#browser-state).
- Re-adding an invalid course from search clears `isInvalid`/`invalidReason`/`lastSynced` and refreshes the stale `course` object, via `updateExistingEnrollment` in [courseUtils.ts](../../web/src/lib/courseUtils.ts).

## Summary Semantics

- A course counts as **Open** only when _every_ selected section is open, but as **Waitlisted**/**Closed** when _any_ section is. The asymmetry is deliberate: one problematic section blocks clean enrollment.
- Credit totals exclude invalid enrollments; all counts split into visible/total when some courses are hidden.

## Section Ordering

- Rows render in `selectedSections` order, and the first element is the primary section — so the array must stay in section-type priority order (LEC before TUT). Build paths don't guarantee that order, so they normalize through `sortSectionsByPriority`. Fixes [issue #58](https://github.com/EagleZhen/another-cuhk-course-planner/issues/58).
