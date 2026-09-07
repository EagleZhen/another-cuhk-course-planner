# Deployment

The web app is deployed at <https://another-cuhk-course-planner.com/>.

## Hosting

The app is hosted on Cloudflare Pages as a static export (`output: 'export'` in [web/next.config.ts](../web/next.config.ts)): `npm run build` emits a static site to `web/out/`.

Config splits between [web/wrangler.jsonc](../web/wrangler.jsonc) — the source of truth for the output dir and the Functions runtime (compatibility date and flags) — and the Cloudflare dashboard, which owns only the build command (`npm run build`) and root directory (`web`), which Pages has no config-file field for. Node is pinned via [web/.nvmrc](../web/.nvmrc); Cloudflare ignores `package.json`'s `engines` (see [decisions.md](decisions.md#pin-the-node-version-via-nvmrc)).

The build command must stay `npm run build`, never `next build` alone: anything chained after it in [web/package.json](../web/package.json) — currently the source-map cleanup below — is otherwise skipped, silently and only on Cloudflare.

The repository no longer keeps a `vercel.json` file or Vercel runtime packages.

### Serving and billing

Cloudflare serves assets first — HTML, course JSON under [web/public/data/](../web/public/data/), and images are free static assets (edge-cached; even `304` revalidations cost nothing). Only the PostHog proxy at `/x8m2k/*` runs as a Pages Function, the sole path billed against the Functions limit (100k/day free) — so eager-loading ~400 course files per session is cheap. Cloudflare bills only requests matched by the auto-generated `_routes.json` `include` (Pages derives it from `functions/`; ours is just `/x8m2k/*`), so adding a `functions/` route is what would re-bill the catalog. See [decisions.md](decisions.md#static-export-over-the-next-on-pages-adapter).

### Stale chunks after a deploy

A new build's chunks get new hashes, so a tab open across a deploy asks for one that no longer exists and throws `ChunkLoadError`. [error.tsx](../web/src/app/error.tsx) recovers by navigating to `?refreshed=1` — at most once per build — and `StaleVersionNotice` explains the refresh on the page that comes back.

Repeats are blocked twice ([staleChunk.ts](../web/src/lib/staleChunk.ts)): only a page that mounts strips the `?refreshed=1` marker, so a failure that never mounts leaves it in the URL; and a tab records the build it recovered from. A later deploy is a different build, arriving without a marker, and recovers normally.

`StaleVersionNotice` renders from `page.tsx`, not the layout — `error.js` replaces the page and leaves the layout standing, so only that placement keeps the notice off the error page.

A recovered chunk reports `stale_chunk_recovered` rather than an exception, so routine deploys no longer raise Error Tracking issues. A chunk error that reaches the error page still does.

## Analytics

Analytics use PostHog, initialized in `web/src/instrumentation-client.ts`.

posthog-js sends everything to `/x8m2k` (its `api_host`) — a same-origin path, so ad blockers don't recognize PostHog's domain — and a catch-all Pages Function (`web/functions/x8m2k/[[path]].ts`) forwards it to PostHog's ingest host, `us.i.posthog.com`. The Function runs only at the edge (production or `wrangler pages dev`, not plain `npm run dev`) and is the app's only Function. Local dev works without analytics when `NEXT_PUBLIC_POSTHOG_KEY` is unset.

Don't confuse that with `ui_host` (`us.posthog.com`): that's PostHog's separate dashboard host, referenced only so the SDK can link back to it. No events go there, so it isn't proxied.

The entry pageview captures UTM attribution before `utm_*` parameters are removed, and captured URLs omit query parameters. Error Tracking records unhandled errors plus explicit captures from boundaries and critical caught failures. Exceptions include the build ID, page visibility, navigation type, and time since page load; session recording remains disabled.

### Source Maps

Production builds upload source maps to PostHog so stack traces name real files and lines, then delete them — nothing new is served to browsers. `POSTHOG_PERSONAL_API_KEY` and `POSTHOG_PROJECT_ID` live in Cloudflare's Production environment only, set as Secrets under Variables and secrets — while `wrangler.jsonc` manages vars, the dashboard's plaintext panel is locked. Without a key no maps are generated, so local builds and preview deploys are unchanged.

The uploader always leaves a couple behind ([posthog-js#2383](https://github.com/PostHog/posthog-js/issues/2383)), so [finalize-source-maps.mts](../web/scripts/finalize-source-maps.mts) deletes whatever reaches `out/` after every build — and fails a keyed build with no chunk IDs, the sign that the upload did nothing.

See [decisions.md](decisions.md#posthog-over-vercel-analytics) for the analytics provider rationale.

## Re-Showing the Mobile Notice

To show the mobile desktop-preview notice again to all users (e.g., for a promotion), bump `NOTICE_VERSION` in [web/src/lib/constants.ts](../web/src/lib/constants.ts) and deploy. Users store the version they dismissed, so a new version re-triggers the notice once per user.

## Checks

Before deploying web changes, run `npm run build` from `web/` — see [development.md](development.md#common-checks) for the full command set and when each applies.
