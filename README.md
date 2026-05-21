# Another CUHK Course Planner

https://another-cuhk-course-planner.com/

https://github.com/user-attachments/assets/1e43274b-4507-4221-a4f4-cde574fe6342

A CUHK course planner with fast search, current scraped course data, timetable planning, and conflict detection.

---

## Features

- **Fast local search** by course code, title, or instructor
- **Day filtering** for finding courses that fit specific days
- **Visual timetable** with automatic time-conflict detection
- **Section cycling** in the shopping cart for compatible alternatives
- **CUHK cohort compatibility** for section pairing, such as `A-LEC` with `AE01-EXR`
- **Calendar export** to `.ics`
- **Screenshot export** for saving a timetable image
- **Auto-save** using browser storage

---

## Development

For setup, local development, scraping, publishing data, and validation checks, see [docs/development.md](docs/development.md).

Quick start for the web app:

```bash
cd web
npm install
npm run dev
```

Open <http://localhost:3000>.

---

## Project Structure

```text
.
├── scripts/              Python scraper and data publishing tools
├── data/                 Scraped course JSON files
├── logs/                 Scraping and publishing logs
├── docs/                 Development and scraper documentation
└── web/                  Next.js web app
    ├── public/data/      Published course data used by the app
    └── src/              App, components, utilities, and types
```

---

## Documentation

- [Development guide](docs/development.md) - local setup, commands, scraping, publishing, and checks
- [Scraper notes](docs/scraper.md) - scraper behavior, edge cases, validation, and debugging
- [Web app README](web/README.md) - frontend package notes and commands

---

## Tech Stack

- **Scraper:** Python, requests, BeautifulSoup, ddddocr
- **Web:** Next.js, React, TypeScript, Tailwind CSS, Zod

---

## Deployment

The app is deployed at <https://another-cuhk-course-planner.com/>.

Course data is updated manually by rerunning the scraper and publish workflow.
