# Documentation

This directory keeps project notes for maintainers and agents. The goal is clear ownership, not exhaustive documentation.

## Start Here

- [development.md](development.md): local setup, commands, checks, and env vars
- [architecture.md](architecture.md): current system shape and key invariants
- [data-pipeline.md](data-pipeline.md): scraping, publishing, validation, logs, and data files
- [deployment.md](deployment.md): hosting, analytics, and deployment checks
- [decisions.md](decisions.md): optional rationale for project choices
- [improvements.md](improvements.md): cross-cutting known issues and architecture debt
- [components/course-search.md](components/course-search.md): CourseSearch behavior and important local rationale
- [components/weekly-calendar.md](components/weekly-calendar.md): WeeklyCalendar invariants and ICS export/undo rationale
- [../web/README.md](../web/README.md): web package commands

## Principles

- Document why and what-breaks, not what the code visibly does.
- Keep docs concise and aligned with the current code.
- Put operational details near the workflow that uses them.
- Keep local rationale beside the behavior it explains.
- Use [decisions.md](decisions.md) as an optional appendix when rationale would distract from an operational doc.
- Prefer links to source files, logs, samples, or related docs over duplicating details.
