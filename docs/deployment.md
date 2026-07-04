# Deployment

The web app is deployed at <https://another-cuhk-course-planner.com/>.

## Hosting

The app is hosted on Cloudflare Pages.

The app is mostly static after build, so Cloudflare Pages fits the workload well. See [decisions.md](decisions.md#cloudflare-pages-over-vercel) for the hosting rationale.

The repository no longer keeps a `vercel.json` file or Vercel runtime packages.

Cloudflare Pages builds with the Node.js version pinned in [web/.nvmrc](../web/.nvmrc) — it does not read `package.json`'s `engines` field. See [decisions.md](decisions.md#pin-the-node-version-via-nvmrc) for why this is pinned explicitly.

## Analytics

Analytics use PostHog, initialized in `web/src/instrumentation-client.ts`.

The app sends PostHog events through the `/x8m2k` rewrite configured in `web/next.config.ts`. Local development works without analytics when `NEXT_PUBLIC_POSTHOG_KEY` is unset.

See [decisions.md](decisions.md#posthog-over-vercel-analytics) for the analytics provider rationale.

## Re-Showing the Mobile Notice

To show the mobile desktop-preview notice again to all users (e.g., for a promotion), bump `NOTICE_VERSION` in [web/src/lib/constants.ts](../web/src/lib/constants.ts) and deploy. Users store the version they dismissed, so a new version re-triggers the notice once per user.

## Checks

Before deploying web changes, run `npm run build` from `web/` — see [development.md](development.md#common-checks) for the full command set and when each applies.
