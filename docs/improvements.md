# Improvements

Cross-cutting known issues, upcoming needs, and architecture debt. Component-local
limitations stay in the component docs (see
[course-search.md](components/course-search.md#known-limitations)).

This is a working list, not a commitment. Items should describe the problem and
why it matters; solutions belong in the change that fixes them.

## Year-Scoped Course Data

The whole pipeline and app assume a single academic year of data. Scraped files
currently carry only the 2025-26 terms, and nothing in the data files, publish
validation, or app distinguishes academic years.

When the next year's catalog becomes available, last year's terms become useless
payload for planning, but the current model has no way to drop or partition them.
This affects the scraper output shape, publish validation, data loading, term
selection, and the term-scoped localStorage keys.

This is the main upcoming data-model change to plan for.

## Partial Load Triggers False Invalidations

When some subject files fail to load,
[CourseSearch.tsx](../web/src/components/CourseSearch.tsx) shows a partial-load
warning but still passes the partial course list to `onDataUpdate` with no
failure signal. The background sync in [page.tsx](../web/src/app/page.tsx) then
marks enrollments it cannot find as "Course no longer available", which is false
when the course's subject file simply failed to load.

Nothing is deleted and a later successful load re-validates the enrollment, but
the false warning undermines trust in the invalid-course feature. Sync should be
skipped (or scoped to successfully loaded subjects) when the load was partial.

## Architecture Debt

- [page.tsx](../web/src/app/page.tsx) (~850 lines) is the single state hub and
  keeps growing. Acceptable while the state surface is stable; revisit if new
  global state is added.
- [courseUtils.ts](../web/src/lib/courseUtils.ts) (~1,500 lines) mixes several
  categories of pure functions (calendar math, formatting, compatibility, ICS).
  Splitting by category would help navigation; the functions themselves are
  already pure and decoupled.
- [CourseSearch.tsx](../web/src/components/CourseSearch.tsx) (~2,700 lines)
  contains `CourseCard` and several subviews in one file.

## Non-Goals For Now

- **On-demand subject loading**: startup loads all subjects in parallel and is
  fast enough; splitting it would be premature optimization.
- **Live enrollment updates**: availability is scraped, not real-time, by design.
  See [decisions.md](decisions.md#frontend-only-static-app).
