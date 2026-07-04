# Improvements

Cross-cutting known issues, upcoming needs, and architecture debt. Component-local limitations stay in the component docs (see [course-search.md](components/course-search.md#known-limitations)).

Working list, not a commitment. Describe the problem and why it matters; solutions belong in the change that fixes them.

A discrete, closeable fix belongs in the issue tracker, not here. Keep this doc for durable properties of the system that don't close via a single fix: standing constraints, recurring debt, and deliberate non-goals.

## Year-Scoped Course Data

The pipeline and app assume a single academic year: data files carry only the 2025-26 terms, and nothing in scraping, publish validation, or loading distinguishes years. When next year's catalog arrives, old terms become useless payload with no way to drop or partition them.

Main upcoming data-model change. Touches scraper output, publish validation, data loading, term selection, and `schedule_${term}` localStorage keys.

## Terminology Consistency

Core domain types (`InternalCourse`, `InternalSection`, `InternalMeeting`, `CourseEnrollment`, `InternalTerm`) are used consistently across code and docs. Two things worth a closer look before writing anything permanent:

- `WeeklyCalendar`/"timetable" and `ShoppingCart`/"cart" are code-name vs. prose-shorthand pairs, applied consistently so far, but nothing states they're intentional synonyms.
- "Catalog" already has an established meaning (CUHK's external system, e.g. "CUHK catalog"). It's easy to accidentally reuse it for the CourseSearch component instead (caught this happening in a PR description during this refactor) — a real conflation risk, not just a naming preference.

Worth a proper investigation pass (how consistently the code itself uses these terms, not just the docs) before deciding whether a small glossary is warranted. Not attempting in this PR.

## Architecture Debt

- [page.tsx](../web/src/app/page.tsx) (~850 lines): single state hub, keeps growing. Fine while the state surface is stable.
- [courseUtils.ts](../web/src/lib/courseUtils.ts) (~1,500 lines): mixes calendar math, formatting, compatibility, and ICS. Splitting by category would help navigation; functions are already pure and decoupled.
- [CourseSearch.tsx](../web/src/components/CourseSearch.tsx) (~2,700 lines): `CourseCard` and several subviews live in one file.

## Non-Goals For Now

- **On-demand subject loading**: parallel startup load is fast enough; splitting it would be premature optimization.
- **Live enrollment updates**: availability is scraped, not real-time, by design. See [decisions.md](decisions.md#frontend-only-static-app).
