# Decisions

Optional rationale for project choices. Operational docs should stay concise and link here when extra context would distract from the workflow.

Keep entries short and focused on real "why not another option?" questions.

## Frontend-Only Static App

The planner mostly serves scraped course data and runs interactive planning in the browser. A backend would add maintenance, deployment complexity, fragility, and cost without solving a current core problem.

Decision: publish static JSON files to [web/public/data/](../web/public/data/) and keep planner state in the browser.

Why it fits:

- hosting stays simple and cheap
- development, debugging, and iteration stay easier because there is no app server to operate
- search/filtering is fast after startup because the searchable text is small enough to handle in the browser
- the app is less fragile to backend/network availability after static data has loaded

Tradeoffs / watchouts:

- startup loading needs care because the browser fetches many JSON files
- features that require private server-side state would need a new architecture

## Cloudflare Pages Over Vercel

The app is mostly static after build, but Vercel Edge requests consumed the free quota quickly.

Decision: host the app on Cloudflare Pages.

Why it fits:

- Cloudflare's static asset request and bandwidth model fits this app better
- deployment stays aligned with the frontend-only/static architecture

## PostHog Over Vercel Analytics

Vercel Analytics was too limited for this project's free-plan analytics needs, especially around date ranges, breakdowns, and event analysis.

Decision: use PostHog for product analytics.

Why it fits:

- PostHog gives more useful ways to understand how students use planner features
- flexible breakdowns and date ranges are more useful than Vercel Analytics for current product questions

Where:

- analytics initializes in [web/src/instrumentation-client.ts](../web/src/instrumentation-client.ts)
- event helpers live in [web/src/lib/analytics.ts](../web/src/lib/analytics.ts)

## Regression-First Testing With Vitest

No tests existed before; features shipped on manual testing alone. Writing a full test suite retroactively is a large, low-motivation task that tends to stall before it starts.

Decision: adopt regression-first testing — write a test alongside each bug fix (reproduce, then fix), rather than attempting upfront full coverage. Use [Vitest](https://vitest.dev/) for unit tests of pure logic in [courseUtils.ts](../web/src/lib/courseUtils.ts) and extracted `page.tsx` handlers, matching [Next.js's own Vitest guide](../web/node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md) (Vitest + React Testing Library, `jsdom` environment, `vite-tsconfig-paths` for `@/` import aliases).

Why it fits:

- a test written for a bug you just fixed requires no new "what should this do" design work — the correct and incorrect behavior are both already known
- most of the planner's interesting logic (section compatibility, auto-completion, conflict detection) is pure functions, so unit tests don't require rendering components
- protects the [architecture debt](improvements.md#architecture-debt) refactors already planned for `courseUtils.ts`/`page.tsx` from silently reintroducing fixed bugs

Deferred, not rejected:

- component-level interaction tests (Vitest + React Testing Library with `userEvent`) once UI logic complexity, not pure logic, is what's breaking
- full end-to-end tests (Playwright, already available via this environment's `webapp-testing` skill) reserved for the highest-value multi-step journeys (ICS export/import roundtrip, calendar screenshot), since E2E tests are the most expensive to write and maintain
- Vitest does not support async Server Components (only sync Server/Client Components); this app is client-heavy by the [Frontend-Only Static App](#frontend-only-static-app) decision, so this gap likely doesn't bite yet, but matters if server components are introduced later
