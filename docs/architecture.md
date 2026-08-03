# Architecture

This app is a static, frontend-only planner backed by scraped JSON files. This doc describes the current system shape and the invariants that matter when changing it.

For rationale behind the static/frontend-only direction, see [decisions.md](decisions.md#frontend-only-static-app).

## System Shape

```text
CUHK catalog
    -> scripts/ scraper + publisher
    -> web/public/data/<year>/*.json
    -> browser data loading
    -> validation boundary
    -> internal domain model
    -> planner UI
```

Key boundaries:

- [scripts/](../scripts/) owns scraping, validation before publish, and generated course JSON.
- [web/public/data/](../web/public/data/) is the static data boundary consumed by the app — partitioned by year; the app eager-loads the live year and lazy-loads archived ones on demand (see [course-search.md](components/course-search.md#data-loading)).
- [web/src/lib/validation.ts](../web/src/lib/validation.ts) converts external scraped JSON into internal types.
- [web/src/lib/types.ts](../web/src/lib/types.ts) defines the internal domain model used by components and utilities.
- [web/src/app/page.tsx](../web/src/app/page.tsx) is the main browser state hub.

## Data Boundary

External scraped JSON is treated as untrusted input. It should cross into the web app through [validation.ts](../web/src/lib/validation.ts), which performs runtime validation and converts snake_case data into the app's camelCase internal model.

After that boundary, components and utilities should use the internal types from [types.ts](../web/src/lib/types.ts).

Important invariants:

- external data shape belongs in validation schemas, not UI components
- no `any` types anywhere; boundary functions take `unknown` and let Zod parsing narrow it
- app logic should prefer `InternalCourse`, `InternalSection`, and related internal types
- `SECTION_TYPE_CONFIG` in [types.ts](../web/src/lib/types.ts) is the source of truth for recognized section types and display metadata

## Browser State

[page.tsx](../web/src/app/page.tsx) owns global planner state:

- current term
- course catalog and its per-year loading state
- selected subjects
- enrolled courses and selected sections
- visibility, conflict, and invalid-course state
- localStorage restore/save flow
- callbacks passed to `CourseSearch`, `WeeklyCalendar`, and `ShoppingCart`

Schedules are stored per term using `schedule_${currentTerm}` keys. The state is restored only after hydration so browser-only APIs do not create SSR/client mismatches.

Restore migrates known `SCHEDULE_DATA_VERSION`s forward via `readStoredEnrollments` in [courseUtils.ts](../web/src/lib/courseUtils.ts) rather than wiping on every schema change; only unknown or newer versions clear the cart.

When fresh course data loads, existing enrollments are synchronized instead of silently deleted. Missing courses or sections are marked invalid so the user can see what changed.

## Domain Logic

[courseUtils.ts](../web/src/lib/courseUtils.ts) contains most shared planner logic. Keep logic there when it is pure and reused across components.

Major responsibilities:

- convert enrollments into calendar events
- detect visible-event time conflicts
- compute deterministic course colors
- parse and display section types
- auto-complete compatible section selections
- format course codes and instructors
- generate ICS exports and undo files

Section compatibility follows CUHK cohort prefixes: sections with the same letter prefix are compatible, while prefixless sections act as wildcards. This is used when auto-completing section selections.

Conflict detection is a two-step model:

1. convert current enrollments into calendar events
2. mark events as conflicting when visible event times overlap

## UI Surfaces

The main UI surfaces are:

- [CourseSearch](components/course-search.md): data loading, search/filtering, course cards, and section selection before adding to the planner
- [WeeklyCalendar](components/weekly-calendar.md): visual timetable, conflict display, screenshots, ICS export, and ICS undo
- [ShoppingCart](components/shopping-cart.md): enrolled courses, section cycling, visibility toggles, and remove/update actions

Component-specific rationale should stay in focused component docs when it helps editing that component. Broad tradeoff rationale belongs in [decisions.md](decisions.md).
