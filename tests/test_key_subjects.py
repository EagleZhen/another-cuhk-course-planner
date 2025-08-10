#!/usr/bin/env python3
"""
Test script for key subjects for user testing
Uses the core scraper which is now memory-safe by default
"""

import logging
from cuhk_scraper import CuhkScraper, ScrapingConfig

def main():
    """Test scraper with key subjects for user testing"""
    
    # Set up logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler('key_subjects_test.log'),
            logging.StreamHandler()
        ]
    )
    
    logger = logging.getLogger(__name__)
    
    # Key subjects for user testing
    test_subjects = [
        "CSCI",  # Computer Science
        "ENGG",  # Engineering
        "CENG",  # Computer Engineering  
        "AIST",  # AI & Information Systems
        "PHYS",  # Physics
        "UGCP",  # University General Core Programme
        "UGFN",  # University General - Foundation
        "UGFH",  # University General - Humanities
        "UGEA",  # University General Education - Area A
        "UGEB",  # University General Education - Area B
        "UGEC",  # University General Education - Area C
        "UGED"   # University General Education - Area D
    ]
    
    logger.info(f"🧪 Testing Core Scraper (Memory-Safe)")
    logger.info(f"📚 Subjects: {test_subjects}")
    
    try:
        # Create scraper
        scraper = CuhkScraper()
        
        # Use production config for clean output
        config = ScrapingConfig.for_production()
        config.output_directory = "data"
        
        logger.info("🚀 Starting scraping (memory-safe by default)...")
        
        # Use the core scraper method
        results = scraper.scrape_all_subjects(
            subjects=test_subjects,
            get_details=True,
            get_enrollment_details=True,
            config=config
        )
        
        # Results summary
        completed = results['completed']
        failed = results['failed']
        saved_files = results['saved_files']
        
        logger.info("🎉 SCRAPING TEST COMPLETED!")
        logger.info(f"✅ Completed: {len(completed)} subjects")
        logger.info(f"❌ Failed: {len(failed)} subjects")
        
        if completed:
            logger.info("✅ Successfully scraped subjects:")
            for subject in completed:
                if subject in saved_files:
                    logger.info(f"   - {subject} → {saved_files[subject]}")
                else:
                    logger.info(f"   - {subject} → (already existed)")
        
        if failed:
            logger.info(f"❌ Failed subjects: {', '.join(failed)}")
            logger.info("🔄 You can run this script again to retry failed subjects")
        
        logger.info("🎉 Ready for user testing!")
        logger.info("📁 Check data/ folder for JSON files")
        
    except KeyboardInterrupt:
        logger.info("⚠️  Test interrupted - completed subjects are already saved!")
    except Exception as e:
        logger.error(f"💥 Test failed: {e}")

if __name__ == "__main__":
    main()