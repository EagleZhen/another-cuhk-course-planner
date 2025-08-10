#!/usr/bin/env python3
"""
Simple script to scrape all subjects from CUHK course catalog
"""

import logging
from cuhk_scraper import CuhkScraper

def main():
    """Scrape all subjects and export to individual JSON files"""
    
    # Set up logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler('scraping.log'),
            logging.StreamHandler()
        ]
    )
    
    logger = logging.getLogger(__name__)
    logger.info("Starting CUHK course scraping for all subjects")
    
    try:
        # Initialize scraper
        scraper = CuhkScraper()
        
        # Get all subjects from live website
        logger.info("Getting subjects from live website...")
        subjects = scraper.get_subjects_from_live_site()
        
        if not subjects:
            logger.error("Could not get subjects from live website")
            return
        
        logger.info(f"Found {len(subjects)} subjects: {subjects[:10]}{'...' if len(subjects) > 10 else ''}")
        
        # Production scraping with full details
        logger.info("Starting production scraping...")
        logger.info("Configuration:")
        logger.info("  - Unlimited courses per subject")
        logger.info("  - Full course details enabled")
        logger.info("  - Enrollment details enabled")
        logger.info("  - Per-subject JSON files in /data/")
        logger.info("  - Progress tracking enabled")
        
        # Use production workflow
        summary = scraper.scrape_and_export_production(
            subjects=subjects,
            get_details=True,
            get_enrollment_details=True
        )
        
        logger.info("Scraping completed!")
        logger.info(f"Summary: {summary}")
        
    except KeyboardInterrupt:
        logger.info("Scraping interrupted by user")
        
        # Try to resume if progress tracking was enabled
        try:
            logger.info("You can resume scraping later with:")
            logger.info("  python scrape_all_subjects.py --resume")
        except:
            pass
            
    except Exception as e:
        logger.error(f"Scraping failed: {e}")
        logger.info("You can retry failed subjects with:")
        logger.info("  python scrape_all_subjects.py --retry")

def resume_scraping():
    """Resume scraping from previous progress"""
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
    logger = logging.getLogger(__name__)
    
    logger.info("Resuming scraping from previous progress...")
    
    scraper = CuhkScraper()
    summary = scraper.resume_production_scraping()
    logger.info(f"Resume completed: {summary}")

def retry_failed():
    """Retry failed subjects"""
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
    logger = logging.getLogger(__name__)
    
    logger.info("Retrying failed subjects...")
    
    scraper = CuhkScraper()
    summary = scraper.retry_failed_subjects()
    logger.info(f"Retry completed: {summary}")

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        if sys.argv[1] == "--resume":
            resume_scraping()
        elif sys.argv[1] == "--retry":
            retry_failed()
        else:
            print("Usage: python scrape_all_subjects.py [--resume|--retry]")
    else:
        main()