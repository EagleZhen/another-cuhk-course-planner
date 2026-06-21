# Deployment

The web app is deployed at <https://another-cuhk-course-planner.com/>.

## Hosting

The app is hosted on Cloudflare Pages.

This project moved away from Vercel because the free quota was consumed too quickly by Edge requests. The app is mostly static after build, so Cloudflare Pages is a better fit: static asset requests and bandwidth are generous enough for this workload, while the deployment remains simple.

The repository no longer keeps a `vercel.json` file or Vercel runtime packages.

## Analytics

Analytics use PostHog, initialized in `web/src/instrumentation-client.ts`.

PostHog is preferred over Vercel Analytics because the free plan is more useful for this project: it offers more flexible date ranges, breakdowns, and event analysis for understanding how students use planner features.

The app sends PostHog events through the `/x8m2k` rewrite configured in `web/next.config.ts`. Local development works without analytics when `NEXT_PUBLIC_POSTHOG_KEY` is unset.

## Checks

Before deploying web changes, run these from `web/`:

```bash
npm run lint
npm run typecheck
npm run build
```
