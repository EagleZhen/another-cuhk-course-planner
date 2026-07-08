#!/usr/bin/env python3
"""
Generate subject code to title mapping from scraped course data.

This script creates the SUBJECT_TITLES constant for web/src/lib/subjects.ts,
which serves as the single source of truth for all subject-related data.

Usage:
    uv run python scripts/generate_subjects.py

After running, copy the output to web/src/lib/subjects.ts (replace the SUBJECT_TITLES constant)
"""

import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / "data"

# Interim: data/ is partitioned by academic year. Read the current live year so the
# subject list matches what publish serves (INTERIM_PUBLISH_YEAR in
# publish_course_data.py). Becomes a union across year dirs when per-year serving lands.
INTERIM_YEAR = "2025-26"


def format_ts_string(value: str) -> str:
    # Match Prettier's TS output so regenerated subjects.ts does not create churn.
    escaped = value.replace("\\", "\\\\")
    if "'" in escaped and '"' not in escaped:
        return f'"{escaped}"'
    escaped = escaped.replace("'", "\\'")
    return f"'{escaped}'"


def main():
    subject_titles = {}

    for filepath in sorted((DATA_DIR / INTERIM_YEAR).glob("*.json")):
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)

        subject = data["metadata"]["subject"]
        subject_title = data["metadata"]["subject_title"]

        subject_titles[subject] = subject_title

    # Generate TypeScript constant
    print("const SUBJECT_TITLES: Record<string, string> = {")
    for subject in sorted(subject_titles.keys()):
        print(f"  {subject}: {format_ts_string(subject_titles[subject])},")
    print("} as const")


if __name__ == "__main__":
    main()
