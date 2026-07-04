# Improvements

Cross-cutting known issues, upcoming needs, and architecture debt. Component-local limitations stay in the component docs (see [course-search.md](components/course-search.md#known-limitations)).

Working list, not a commitment. Describe the problem and why it matters; solutions belong in the change that fixes them.

## Year-Scoped Course Data

The pipeline and app assume a single academic year: data files carry only the 2025-26 terms, and nothing in scraping, publish validation, or loading distinguishes years. When next year's catalog arrives, old terms become useless payload with no way to drop or partition them.

Main upcoming data-model change. Touches scraper output, publish validation, data loading, term selection, and `schedule_${term}` localStorage keys.

## Debug Logging Cleanup

`web/src` still has frequent `console.log`/emoji debug output left over from earlier development. The Python publish script already shows the target style: emoji reserved for genuinely attention-worthy points, not every log line. Web logging should be reduced to match.

## Architecture Debt

- [page.tsx](../web/src/app/page.tsx) (~850 lines): single state hub, keeps growing. Fine while the state surface is stable.
- [courseUtils.ts](../web/src/lib/courseUtils.ts) (~1,500 lines): mixes calendar math, formatting, compatibility, and ICS. Splitting by category would help navigation; functions are already pure and decoupled.
- [CourseSearch.tsx](../web/src/components/CourseSearch.tsx) (~2,700 lines): `CourseCard` and several subviews live in one file.

## Non-Goals For Now

- **On-demand subject loading**: parallel startup load is fast enough; splitting it would be premature optimization.
- **Live enrollment updates**: availability is scraped, not real-time, by design. See [decisions.md](decisions.md#frontend-only-static-app).
