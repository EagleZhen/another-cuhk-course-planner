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

[page.tsx](../web/src/app/page.tsx) composes the saved-schedule owner with catalog and view state:

- selected term and owned enrollments from the schedule owner
- course catalog and its per-year loading state
- subject filters, tentative section selections, and focused enrollment
- derived calendar/conflict/change information
- callbacks passed to `CourseSearch`, `WeeklyCalendar`, and `ShoppingCart`

[useSavedSchedule](../web/src/hooks/useSavedSchedule.ts) owns each cart’s term, load outcome, contents, and save status. Term changes activate an unread destination or retained unsaved edits; outgoing contents never acquire the destination’s label or storage key. Restore runs on the client, independently of catalog loading.

[scheduleStorage.ts](../web/src/lib/scheduleStorage.ts) stores one schedule object, revision, and optional catalog timestamp per term in IndexedDB.

A load imports `localStorage` only when the term has no IndexedDB record. Import validates the legacy data, rechecks the destination in a transaction, and leaves the legacy key untouched. Clearing a cart saves an empty record, so reload keeps it empty. If the record is separately deleted, the next load can import the legacy key again.

[storedSchedule.ts](../web/src/lib/storedSchedule.ts) migrates historical enrollment shapes before validating the whole payload. Version 4 stores unknown waitlist counts as null and validates new writes without applying historical defaults. Malformed or unsupported data blocks loading without deleting the original.

Each save requires an existing, compatible record at the expected revision. The check and write share a transaction, and the app reports success after it commits. Random revisions prevent a recreated cart from matching a revision held by a stale tab. Each tab saves serially per term and keeps edits made during a save pending.

Failed saves retain pending edits across term switches and offer retry. Refused writes pause autosave. A confirmed conflict reload replaces edits only after a successful read and only if the edits are still the same. Closing or reloading the page can discard unsaved edits.

Each cart reconciles with a complete catalog for its own year and term. Once a revision records a catalog timestamp, only a newer snapshot can reconcile it. Missing courses and sections remain visible as invalid choices or tombstones.

`SCHEDULE_DATA_VERSION` declares compatibility, even when migrations are idempotent. An incompatible shape needs a new version. Refusing a newer version must preserve its data. The codec preserves unrecognized envelope and payload fields instead of stripping them. This is not a compatibility guarantee for future semantic changes; catalog reconciliation still refreshes course and section snapshots.

Legacy tabs can still change or remove legacy keys. Their later edits stay separate from adopted carts. Clearing site data removes the browser’s saved carts.

## Domain Logic

[courseUtils.ts](../web/src/lib/courseUtils.ts) contains most shared planner logic. Keep logic there when it is pure and reused across components.

Major responsibilities:

- convert enrollments into one calendar event per dated occurrence
- detect conflicts between events sharing a date
- compute deterministic course colors
- parse and display section types
- auto-complete compatible section selections
- format course codes and instructors
- generate ICS exports and undo files

Section compatibility follows CUHK cohorts: two sections pair only when they share a cohort. `cohortOf` reads the cohort from a section code alone, dropping the marker every non-lecture component carries (`AAL1-LAB` → `AA`), so `AA` and `AB` stay distinct and a lab pairs only with its own lecture. A leading dash names a cohort with no name rather than a wildcard, so `--LEC` pairs with `-L01-LAB` but not with `ML01-LAB`. This is used when auto-completing section selections.

Conflict detection is a two-step model:

1. convert current enrollments into calendar events, one per dated occurrence
2. mark events as conflicting when they share a date and their times overlap

Two sections at the same hour in different weeks do not clash. One predicate serves search badges, the cart, the calendar and the course filter, so they cannot disagree.

[calendarLayout.ts](../web/src/lib/calendarLayout.ts) owns the calendar's geometry: `courseUtils` answers whether things clash, `calendarLayout` where they sit.

## UI Surfaces

The main UI surfaces are:

- [CourseSearch](components/course-search.md): search/filtering, course cards, and section selection before adding to the planner
- [WeeklyCalendar](components/weekly-calendar.md): visual timetable, conflict display, screenshots, ICS export, and ICS undo
- [ShoppingCart](components/shopping-cart.md): enrolled courses, section cycling, visibility toggles, and remove/update actions

Component-specific rationale should stay in focused component docs when it helps editing that component. Broad tradeoff rationale belongs in [decisions.md](decisions.md).
