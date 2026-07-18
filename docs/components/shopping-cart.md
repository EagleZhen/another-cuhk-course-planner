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

## Change Detection

Flags an enrolled section that changed (time, location, instructor, or language) since the user last saw it, so they know to re-export their `.ics` or update a saved screenshot — which the app can't do for them.

- The rendered timetable is always the fresh scrape. What the user _last saw_ is kept as an invisible per-section signature (`lastSeenSections` on `CourseEnrollment`); a section whose current signature differs is surfaced as changed.
- That signature advances only on add / section-change / sync / dismiss — never on plain reload — so a note persists across reloads until dismissed and re-fires on further change. Sync only fills in _missing_ signatures, so fresh data the user hasn't seen yet isn't retroactively flagged.
- Compares time + location + instructor + language; ignores `dates` and availability; only `selectedSections`. Detection compares meeting positions to decide whether to show the summary banner; detail rows use content-based set differences so a deletion does not make later meetings look changed. Logic lives in [courseUtils.ts](../../web/src/lib/courseUtils.ts) (`sectionSignature`, `diffEnrollment`, `diffSectionDetail`).
- Added or removed meetings get an amber row; removed meetings also use strikethrough and appear after the current rows. Changes that pair one-to-one highlight only the fields that moved.
- A whole course or section disappearing stays on the `isInvalid` path above. A meeting disappearing from a section that still exists stays in the valid card as a removed row.

## Summary Semantics

- A course counts as **Open** only when _every_ selected section is open, but as **Waitlisted**/**Closed** when _any_ section is. The asymmetry is deliberate: one problematic section blocks clean enrollment.
- Credit totals exclude invalid enrollments; all counts split into visible/total when some courses are hidden.

## Section Ordering

- Rows render in `selectedSections` order, and the first element is the primary section — so the array must stay in section-type priority order (LEC before TUT). Build paths don't guarantee that order, so they normalize through `sortSectionsByPriority`. Fixes [issue #58](https://github.com/EagleZhen/another-cuhk-course-planner/issues/58).
