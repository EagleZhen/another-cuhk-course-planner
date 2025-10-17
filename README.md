# another-cuhk-course-planner

https://another-cuhk-course-planner.com/

https://github.com/user-attachments/assets/1e43274b-4507-4221-a4f4-cde574fe6342

I just want a course planner with the latest course data that is actually useful and convenient for the students......

Why is there no one making an actually good one?

---

## Features

-   **Fast local search** - by course code, title, or instructor
-   **Day filtering** - filter courses by specific days
-   **Visual calendar** - weekly view with automatic conflict detection
-   **Section cycling** - click `<` and `>` in the shopping cart to cycle through available sections
-   **Smart cohorts** - handles CUHK's section pairing system automatically, e.g., A-LEC can only pair with AE01-EXR (same A-cohort)
-   **Export** - download .ics for importing into Google Calendar, Outlook, etc.
-   **Screenshot** - save your schedule as a .png image
-   **Auto-save** - everything persists in your browser

---

## Setup

### 1. Scrape course data

```bash
poetry install
poetry run python scrape_all_subjects.py
```

Scrapes all ~259 subjects to `data/*.json` (~50MB total). Takes 1-2 hours.

### 2. Publish data to web app

```bash
poetry run python publish_course_data.py
```

Validates and publishes course data from `data/` to `web/public/data/` for deployment.

### 3. Run the web app

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000

---

## Project Structure

```
.
├── cuhk_scraper.py              Main scraper logic
├── scrape_all_subjects.py       Run this to scrape all subjects
├── publish_course_data.py       Publish data to web app with validation
├── data_utils.py                HTML/markdown utilities
├── analyze_course_data.py       Data analysis scripts
│
├── data/                        Scraped course JSONs (one per subject)
├── logs/                        Scraping logs & progress tracking
│
└── web/
    ├── public/data/             Course data for web app (published from /data)
    └── src/
        ├── app/                 page.tsx = main state hub
        ├── components/          React components
        └── lib/                 Utilities, types, validation
```

---

## Commands

**Scraper:**

```bash
poetry run python scrape_all_subjects.py  # Production (all subjects)
poetry run python cuhk_scraper.py         # Test mode (3 courses/subject)
poetry run python publish_course_data.py  # Publish data to web app
```

**Web app:**

```bash
cd web
npm run dev      # Development
npm run build    # Production build
npm run lint     # ESLint
```

---

## Tech Stack

**Scraper:** Python + requests + BeautifulSoup + ddddocr (OCR captcha solving)

**Web:** Next.js 15 + React 19 + TypeScript + Tailwind + Zod validation

See [CLAUDE.md](CLAUDE.md) for architecture details.

---

## Deployment

https://another-cuhk-course-planner.com/
Cloudflare Pages. Data updates manually (re-run scraperperiodically).
