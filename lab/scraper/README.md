# Scraper Lab

Ad hoc scraper investigation files.

This directory is for debugging CUHK page-structure changes, saved sample pages, captcha samples, temporary scripts, trial outputs, and logs. The scripts here are not the active test suite and are not used by the production scraper or web app.

`samples/webpages/` is the exception: `scripts/tests/` parses those pages directly, so they are fixtures rather than scratch files. Real pages beat hand-trimmed copies — the parser's job is to read what CUHK actually serves. Do not delete or rename one without checking the tests.

Class details pages are named with their class number, since one section code can belong to different classes across terms. Generated outputs and logs can be removed when they are no longer useful.
