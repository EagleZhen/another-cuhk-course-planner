# Deployment

The web app is deployed at <https://another-cuhk-course-planner.com/>.

## Hosting

The app is hosted on Cloudflare Pages as a static export (`output: 'export'` in [web/next.config.ts](../web/next.config.ts)): `npm run build` emits a static site to `web/out/`.

Config splits between [web/wrangler.jsonc](../web/wrangler.jsonc) — the source of truth for the output dir and the Functions runtime (compatibility date and flags) — and the Cloudflare dashboard, which owns only the build command (`npm run build`) and root directory (`web`), which Pages has no config-file field for. Node is pinned via [web/.nvmrc](../web/.nvmrc); Cloudflare ignores `package.json`'s `engines` (see [decisions.md](decisions.md#pin-the-node-version-via-nvmrc)).

The repository no longer keeps a `vercel.json` file or Vercel runtime packages.

### Serving and billing

Cloudflare serves assets first — HTML, course JSON under [web/public/data/](../web/public/data/), and images are free static assets (edge-cached; even `304` revalidations cost nothing). Only the PostHog proxy at `/x8m2k/*` runs as a Pages Function, the sole path billed against the Functions limit (100k/day free) — so eager-loading ~400 course files per session is cheap. Keeping the catalog off the Function path is the point of the hosting choice; see [decisions.md](decisions.md#static-export-over-the-next-on-pages-adapter).

## Analytics

Analytics use PostHog, initialized in `web/src/instrumentation-client.ts`.

posthog-js sends everything to `/x8m2k` (its `api_host`) — a same-origin path, so ad blockers don't recognize PostHog's domain — and a catch-all Pages Function (`web/functions/x8m2k/[[path]].ts`) forwards it to PostHog's ingest host, `us.i.posthog.com`. The Function runs only at the edge (production or `wrangler pages dev`, not plain `npm run dev`) and is the app's only Function. Local dev works without analytics when `NEXT_PUBLIC_POSTHOG_KEY` is unset.

Don't confuse that with `ui_host` (`us.posthog.com`): that's PostHog's separate dashboard host, referenced only so the SDK can link back to it. No events go there, so it isn't proxied.

The entry pageview is captured manually, then `utm_*` params are stripped from the URL — so inbound links can be tagged (e.g. `?utm_source=dcard`) without the tag lingering in bookmarks or re-shares. Unhandled JS errors are auto-captured to Error Tracking.

See [decisions.md](decisions.md#posthog-over-vercel-analytics) for the analytics provider rationale.

## Re-Showing the Mobile Notice

To show the mobile desktop-preview notice again to all users (e.g., for a promotion), bump `NOTICE_VERSION` in [web/src/lib/constants.ts](../web/src/lib/constants.ts) and deploy. Users store the version they dismissed, so a new version re-triggers the notice once per user.

## Checks

Before deploying web changes, run `npm run build` from `web/` — see [development.md](development.md#common-checks) for the full command set and when each applies.
