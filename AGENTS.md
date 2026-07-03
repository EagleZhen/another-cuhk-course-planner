# Agent Notes

## Next.js

For Next.js work, read the relevant version-matched docs in `web/node_modules/next/dist/docs/`.

## Project Docs

- `README.md`: overview and repo map
- `docs/README.md`: documentation map (start here for project docs)

## Working Style

Use judgment. Refactor when it improves clarity, maintainability, or correctness.

Challenge assumptions when there is a clear technical reason, and explain the tradeoff briefly.

For generated or tool-managed files, prefer commands over manual edits.

When writing or editing docs, verify each claim against the current implementation — not against other docs, CLAUDE.md history, or memory. A wrong claim is worse than a missing one.

When changing code, check whether a doc in `docs/` describes the affected behavior and update it in the same change.

Run checks proportional to the change. Avoid full scrapes or full builds unless they are relevant, requested, or needed.
