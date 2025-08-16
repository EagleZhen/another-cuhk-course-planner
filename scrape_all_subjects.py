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
        # Initialize production scraper with proper config
        from cuhk_scraper import ScrapingConfig
        scraper = CuhkScraper(ScrapingConfig.for_production())
        
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
        logger.info("  - Course outcome data enabled")
        logger.info("  - Per-subject JSON files in /data/")
        logger.info("  - Progress tracking enabled")
        logger.info("  - Subject titles included in metadata")
        
        # Use clean core API (separation of concerns)
        results = scraper.scrape_all_subjects(subjects)
        
        # Create summary (this is "what to scrape" logic, not core scraping)
        completed_count = len(results['completed'])
        failed_count = len(results['failed'])
        summary = f"Production scraping completed: {completed_count} subjects successful, {failed_count} failed"
        
        logger.info("Scraping completed!")
        logger.info(f"Summary: {summary}")
        
    except KeyboardInterrupt:
        logger.info("Scraping interrupted by user")
        
            
    except Exception as e:
        logger.error(f"Scraping failed: {e}")
        logger.info("Check the progress file to see completed subjects.")
        logger.info("Re-run with specific subjects to retry failures.")

if __name__ == "__main__":
    main()