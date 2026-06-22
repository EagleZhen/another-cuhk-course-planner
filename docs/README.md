# Documentation

This directory keeps project notes for maintainers and agents. The goal is clear
ownership, not exhaustive documentation.

## Start Here

- [development.md](development.md): local setup, commands, checks, and env vars
- [data-pipeline.md](data-pipeline.md): scraping, publishing, validation, logs,
  and data files
- [deployment.md](deployment.md): hosting, analytics, and deployment checks
- [decisions.md](decisions.md): optional rationale for project choices
- [components/course-search.md](components/course-search.md): CourseSearch
  behavior and important local rationale
- [../web/README.md](../web/README.md): web package commands

## Principles

- Keep docs concise and aligned with the current code.
- Put operational details near the workflow that uses them.
- Keep local rationale beside the behavior it explains.
- Use [decisions.md](decisions.md) as an optional appendix when rationale would
  distract from an operational doc.
- Prefer links to source files, logs, samples, or related docs over duplicating
  details.
