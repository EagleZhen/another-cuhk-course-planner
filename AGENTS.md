# Agent Notes

## Next.js

This is not the Next.js you know. This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant version-matched guide in `web/node_modules/next/dist/docs/` before writing any code, and heed deprecation notices.

Next.js recreates `web/AGENTS.md` with this warning, and a `web/CLAUDE.md` pointing at it, on any agent-run `next dev`; `agentRules: false` in `web/next.config.ts` turns that off in favour of this section.

## Project Docs

- `README.md`: overview and repo map
- `docs/README.md`: documentation map (start here for project docs)
- `docs/commit-conventions.md`: required types and scopes; read before proposing or creating a commit title

## Working Style

Use judgment. Refactor when it improves clarity, maintainability, or correctness, and challenge assumptions when there is a clear technical reason — explain the tradeoff briefly.

### Changing Code

Build a producer only together with its consumer. A computed value nothing reads hides that the feature was never finished, and a validation that cannot fail is the same thing wearing a safety vest.

Tolerate malformed values from outside our control — scraped HTML, a hand-edited file — but let a missing key from our own output raise. Degrading quietly on what we wrote ourselves hides the break for months.

Check whether the source states a value before computing one. A derived value stored beside scraped ones looks exactly like them, and can never be checked afterwards.

Give a parser defaults a real value could never take. Empty strings that become zero turn a failed fetch into a plausible record.

Name a function for the scope it operates on, and fix the name in the change that notices the gap. A wrong name outlives whoever still remembers which half was right.

For generated or tool-managed files, prefer commands over manual edits.

### Tests and Checks

Run checks proportional to the change. Avoid full scrapes or full builds unless they are relevant, requested, or needed.

Confirm each new test fails with its change undone.

When a change adds a limit or threshold, test both sides: that it stops past the limit, and that normal work still happens below it. A one-sided test stays green against a badly wrong limit.

Where one module hands data to another, test the seam with the real producer. Hand-building the input tests the consumer against a fiction, and stays green while the two drift apart.

### Docs

When writing or editing docs, verify each claim against the current implementation — not against other docs, CLAUDE.md history, or memory. A wrong claim is worse than a missing one.

When changing code, check whether a doc in `docs/` describes the affected behavior and update it in the same change.

### Deferred Work

`TODO(#N):` marks deferred work with a filed issue; a bare `TODO:` is an unfiled note. When editing near one, mention it, and propose the fix if it is small or blocking — as its own commit, never folded into the current diff. Don't act unasked.

When filing an issue for deferred work, add the marker in the same change, at every site a future editor would have to understand it from. Skip it when the issue is repo-wide rather than localized — a marker on each of a hundred call sites is noise, not a pointer.

Remove the marker when closing its issue (grep for its number). Pointers to closed issues train readers to ignore markers.
