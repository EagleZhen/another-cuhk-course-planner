# Commit Conventions

Use Conventional Commit titles with a small, project-specific set of types and scopes:

```text
<type>(<scope>): <imperative description>
```

The scope is optional. Add `!` before `:` for a breaking change.

Reference an issue with a `Refs: #N` trailer; it shows up on the issue timeline. Use `Closes #N` only when the commit really closes it — GitHub acts on that at merge.

## Types

| Type       | Use for                                                     |
| ---------- | ----------------------------------------------------------- |
| `feat`     | New user-facing behavior                                    |
| `fix`      | Bug fixes, including actual visual defects                  |
| `style`    | Intentional visual-only changes with no functional effect   |
| `refactor` | Internal restructuring with no intended behavior change     |
| `perf`     | Performance improvements                                    |
| `test`     | Tests only                                                  |
| `docs`     | Documentation only                                          |
| `build`    | Build system, packaging, or generated build configuration   |
| `ci`       | CI, Dependabot, and other repository automation             |
| `chore`    | Routine maintenance, data refreshes, and dependency updates |
| `revert`   | Reverting an earlier commit                                 |

In this repository, `style` means a visible presentation change such as spacing, width, colors, or border radius. Use `chore(format)` for formatting-only changes made by Prettier, Ruff, or similar tools.

## Scopes

Choose the narrowest relevant scope:

| Scope        | Area                                                        |
| ------------ | ----------------------------------------------------------- |
| `search`     | Course search, filters, course cards, and subject selection |
| `cart`       | Shopping cart and section controls                          |
| `calendar`   | Timetable, conflicts, screenshots, and calendar export      |
| `planner`    | Shared enrollment state, persistence, and synchronization   |
| `ui`         | Shared components, global styling, and cross-surface layout |
| `web`        | Cross-cutting Next.js app behavior                          |
| `scraper`    | CUHK scraping and parsing                                   |
| `publish`    | Validation and publication of scraped data                  |
| `data`       | Scraped or published course-data updates                    |
| `validation` | External-data schemas and internal-model conversion         |
| `analytics`  | PostHog, instrumentation, and error reporting               |
| `deploy`     | Cloudflare, static export, and deployment configuration     |
| `deps`       | Dependency updates                                          |
| `repo`       | Repository-wide tooling and maintenance                     |
| `format`     | Automated formatting only                                   |

Omit the scope when a change is genuinely cross-cutting. Add a new scope only when it represents a distinct area likely to recur.

## Examples

```text
feat(search): filter courses by academic career
style(cart): tighten action button spacing
fix(calendar): prevent event labels from overflowing
refactor(planner): centralize stored schedule migration
fix(scraper): handle future-dated course headings
feat(publish): generate term manifests automatically
chore(data): update 2025-26, 2026-27 courses (2026-07-21 23:05 HKT)
chore(deps): update PostHog
ci: add Dependabot version updates
docs(calendar): explain ICS undo semantics
chore(format): apply repository formatting
```
