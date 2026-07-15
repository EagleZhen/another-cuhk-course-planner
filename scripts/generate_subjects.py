#!/usr/bin/env python3
"""
Generate web/src/lib/generated/subjects.ts from the scraped course data.

subjects.ts is the single source of truth for subject data:
- SUBJECTS_BY_YEAR: which subjects each academic year offers (year -> codes)
- SUBJECT_TITLES: code -> title, unioned across years (newest year wins on conflict)

Run when the scraped subject set changes, then review the git diff and commit:
    uv run python scripts/generate_subjects.py
"""

from pathlib import Path

from data_utils import collect_subjects, render_subjects_module

PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / "data"
SUBJECTS_FILE = PROJECT_ROOT / "web" / "src" / "lib" / "generated" / "subjects.ts"


def main():
    subjects_by_year, subject_titles = collect_subjects(DATA_DIR)
    SUBJECTS_FILE.write_text(render_subjects_module(subjects_by_year, subject_titles), "utf-8")
    print(f"Wrote {SUBJECTS_FILE.relative_to(PROJECT_ROOT).as_posix()}")


if __name__ == "__main__":
    main()
