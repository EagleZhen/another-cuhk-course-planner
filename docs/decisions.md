# Decisions

Optional rationale for project choices. Operational docs should stay concise and
link here when extra context would distract from the workflow.

Keep entries short and focused on real "why not another option?" questions.

## Frontend-Only Static App

The planner mostly serves scraped course data and runs interactive planning in
the browser. A backend would add maintenance, deployment complexity, fragility,
and cost without solving a current core problem.

Decision: publish static JSON files to [web/public/data/](../web/public/data/)
and keep planner state in the browser.

Why it fits:

- hosting stays simple and cheap
- development, debugging, and iteration stay easier because there is no app
  server to operate
- search/filtering is fast after startup because the searchable text is small
  enough to handle in the browser
- the app is less fragile to backend/network availability after static data has
  loaded

Tradeoffs / watchouts:

- startup loading needs care because the browser fetches many JSON files
- features that require private server-side state would need a new architecture

## Cloudflare Pages Over Vercel

The app is mostly static after build, but Vercel Edge requests consumed the free
quota quickly.

Decision: host the app on Cloudflare Pages.

Why it fits:

- Cloudflare's static asset request and bandwidth model fits this app better
- deployment stays aligned with the frontend-only/static architecture

## PostHog Over Vercel Analytics

Vercel Analytics was too limited for this project's free-plan analytics needs,
especially around date ranges, breakdowns, and event analysis.

Decision: use PostHog for product analytics.

Why it fits:

- PostHog gives more useful ways to understand how students use planner features
- flexible breakdowns and date ranges are more useful than Vercel Analytics for
  current product questions

Where:

- analytics initializes in
  [web/src/instrumentation-client.ts](../web/src/instrumentation-client.ts)
- event helpers live in [web/src/lib/analytics.ts](../web/src/lib/analytics.ts)
