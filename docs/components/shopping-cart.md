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

## Summary Semantics

- A course counts as **Open** only when _every_ selected section is open, but as **Waitlisted**/**Closed** when _any_ section is. The asymmetry is deliberate: one problematic section blocks clean enrollment.
- Credit totals exclude invalid enrollments; all counts split into visible/total when some courses are hidden.

## Known Limitations

- Section rows appear in the order the user clicked them, then jump to priority order after a cycling cascade rebuilds the array (`handleAddCourse` keeps click order; `autoCompleteEnrollmentSections` appends re-added sections). Tracked in [issue #58](https://github.com/EagleZhen/another-cuhk-course-planner/issues/58).
- Re-adding a course from search does not clear its invalid state — the update path replaces `selectedSections` but spreads the old enrollment, keeping `isInvalid` and the stale `course` object. Tracked in [issue #51](https://github.com/EagleZhen/another-cuhk-course-planner/issues/51).
