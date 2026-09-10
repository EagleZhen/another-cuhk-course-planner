#!/usr/bin/env python3
"""
Simple script to scrape all subjects from CUHK course catalog

Usage:
    uv run python scripts/scrape_all_subjects.py              # All subjects
    uv run python scripts/scrape_all_subjects.py PHED         # Single subject
    uv run python scripts/scrape_all_subjects.py PHED,CSCI    # Multiple subjects
    uv run python scripts/scrape_all_subjects.py --resume     # Finish an interrupted full scrape
"""

import argparse
import logging
import sys

from cuhk_scraper import (
    CuhkScraper,
    NothingToResume,
    scrape_log_formatter,
    show_scrape_context,
)
from data_utils import UnreadableProgressLog


def subject_list(value: str) -> list[str]:
    """Split the subjects argument, rejecting an empty one.

    An unset shell variable arrives as "", which would otherwise read as no subjects
    given and start a ~9-hour full scrape.
    """
    subjects = [code.strip() for code in value.split(",")]
    if not all(subjects):
        raise argparse.ArgumentTypeError(f"not a subject list: {value!r}")
    return subjects


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse the command line.

    argparse, not sys.argv: a mistyped flag would otherwise be read as a subject code.
    """
    parser = argparse.ArgumentParser(
        description="Scrape the CUHK course catalog into data/.",
        epilog="With no arguments, scrapes every subject CUHK offers.",
    )
    # Finishing an interrupted scrape and refreshing chosen subjects are different jobs.
    what = parser.add_mutually_exclusive_group()
    what.add_argument(
        "subjects",
        nargs="?",
        type=subject_list,
        help="comma-separated subject codes to refresh, e.g. PHED,CSCI",
    )
    what.add_argument(
        "--resume",
        action="store_true",
        help="scrape only what an interrupted full scrape never reached",
    )
    return parser.parse_args(argv)


def main():
    """Scrape all subjects and export to individual JSON files"""
    args = parse_args()

    # Console only; the scraper adds its own timestamped file. Both render the same
    # format, and gain the subject/course prefix once the scraper exists.
    console = logging.StreamHandler()
    console.setFormatter(scrape_log_formatter())
    logging.basicConfig(level=logging.INFO, handlers=[console])

    logger = logging.getLogger(__name__)
    logger.info("Starting CUHK course scraping for all subjects")

    try:
        # Initialize production scraper with debug HTML saving enabled
        from cuhk_scraper import ScrapingConfig

        config = ScrapingConfig.for_production()
        # config.save_debug_files = True  # Enable debug HTML saving for investigation
        scraper = CuhkScraper(config)
        show_scrape_context(scraper, [console])

        # Get subjects (from args or live website)
        subjects = []
        if args.resume:
            # The scraper reads what is left from the progress log.
            mode = "resume"
        elif args.subjects is not None:
            mode = "partial"
            subjects = args.subjects
            logger.info(f"🎯 Debug mode: scraping {len(subjects)} subject(s): {subjects}")
        else:
            mode = "full"
            # Production mode: scrape all subjects from live website
            logger.info("Getting subjects from live website...")
            subjects = scraper.get_subjects_from_live_site()
            logger.info(
                f"Found {len(subjects)} subjects: {subjects[:10]}{'...' if len(subjects) > 10 else ''}"
            )

        # Production scraping with full details
        logger.info("Starting production scraping...")
        logger.info("Configuration:")
        logger.info("  - Unlimited courses per subject")
        logger.info("  - Full course details enabled")
        logger.info("  - Enrollment details enabled")
        logger.info("  - Course outcome data enabled")
        logger.info("  - Per-subject JSON files in /data/")
        logger.info("  - Progress tracking enabled")
        logger.info("  - Subject titles included in metadata")

        # Use clean core API (separation of concerns)
        results = scraper.scrape_all_subjects(subjects, mode=mode)

        # Create summary (this is "what to scrape" logic, not core scraping)
        completed_count = len(results["completed"])
        failed_count = len(results["failed"])
        summary = f"Production scraping completed: {completed_count} subjects successful, {failed_count} failed"

        logger.info("Scraping completed!")
        logger.info(f"Summary: {summary}")

    # Both say what is wrong and what to do; neither is a scrape that half-happened.
    except (NothingToResume, UnreadableProgressLog) as e:
        logger.error(str(e))
        sys.exit(1)

    except KeyboardInterrupt:
        logger.info("Scraping interrupted by user")

    except Exception as e:
        logger.error(f"Scraping failed: {e}")
        logger.info("Check the progress file to see completed subjects.")
        logger.info("Re-run with specific subjects to retry failures.")


if __name__ == "__main__":
    main()
