# Agent Notes

## Next.js

For Next.js work, read the relevant version-matched docs in `web/node_modules/next/dist/docs/`.

## Project Docs

- `README.md`: overview and repo map
- `docs/README.md`: documentation map (start here for project docs)
- `docs/commit-conventions.md`: required types and scopes; read before proposing or creating a commit title

## Working Style

Use judgment. Refactor when it improves clarity, maintainability, or correctness.

Challenge assumptions when there is a clear technical reason, and explain the tradeoff briefly.

For generated or tool-managed files, prefer commands over manual edits.

When writing or editing docs, verify each claim against the current implementation — not against other docs, CLAUDE.md history, or memory. A wrong claim is worse than a missing one.

When changing code, check whether a doc in `docs/` describes the affected behavior and update it in the same change.

When a change adds a limit or threshold, test both sides: that it stops past the limit, and that normal work still happens below it. A one-sided test stays green against a badly wrong limit. Confirm each new test fails with the change undone.

Run checks proportional to the change. Avoid full scrapes or full builds unless they are relevant, requested, or needed.

`TODO(#N):` marks deferred work with a filed issue; a bare `TODO:` is an unfiled note. When editing near one, mention it, and propose the fix if it is small or blocking — as its own commit, never folded into the current diff. Don't act unasked.

When filing an issue for deferred work, add the marker in the same change, at every site a future editor would have to understand it from. Skip it when the issue is repo-wide rather than localized — a marker on each of a hundred call sites is noise, not a pointer.

Remove the marker when closing its issue (grep for its number). Pointers to closed issues train readers to ignore markers.
