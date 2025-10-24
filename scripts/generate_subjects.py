#!/usr/bin/env python3
"""
Generate subject code to title mapping from scraped course data.

Usage:
    python scripts/generate_subjects.py > output.txt
"""

import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / "data"


def main():
    # Exemption codes - administrative placeholders, not real subjects
    EXCLUDED_SUBJECTS = {'EX_PGDE', 'EX_RPG', 'EX_TPG', 'EX_UG', 'XCBS', 'XCCS', 'XFUD', 'XUNC', 'XUSC', 'XWAS'}

    subject_titles = {}

    for filepath in sorted(DATA_DIR.glob("*.json")):
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)

        subject = data['metadata']['subject']
        subject_title = data['metadata']['subject_title']

        if subject in EXCLUDED_SUBJECTS:
            continue

        subject_titles[subject] = subject_title

    # Generate TypeScript constant
    print("const SUBJECT_TITLES: Record<string, string> = {")
    for subject in sorted(subject_titles.keys()):
        title = subject_titles[subject].replace("'", "\\'")
        print(f"    '{subject}': '{title}',")
    print("} as const")


if __name__ == "__main__":
    main()
