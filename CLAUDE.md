# CLAUDE.md

**CUHK Course Planner**: Production-ready Next.js course scheduling application with enterprise-grade architecture.

## System Status (September 2025) - ✅ PRODUCTION READY

**Architecture:**
```typescript
External JSON → Zod Validation → Internal Types → React Components
     ↓               ↓              ↓               ↓
Raw scraped     Runtime check    Clean domain    Type-safe UI
```

**File Structure:**
```
web/src/
├── app/page.tsx              # State hub + localStorage + navigation
├── components/
│   ├── CourseSearch.tsx      # Search + filtering + section compatibility
│   ├── WeeklyCalendar.tsx    # Weekend support + conflicts + export
│   └── ShoppingCart.tsx      # Section cycling + details navigation
└── lib/
    ├── types.ts              # Internal models (zero `any`)
    ├── validation.ts         # Zod schemas + transformation
    ├── courseUtils.ts        # Pure functions + timezone handling
    ├── calendarConfig.ts     # Weekend-aware configuration
    └── screenshotUtils.ts    # Screenshot functionality
```

## Development Commands

**Frontend (React 19 + Next.js 15):**
```bash
cd web
npm install
npm run dev          # Development server
npm run build        # Production build (clean)
npm run lint         # Quality check
```

**Data Scraping (Python 3.8+):**
```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python scrape_all_subjects.py   # Production scraping
```

## ✅ Key Features (Production Ready)

**Core Systems:**
- **Dynamic Calendar**: Weekend support, timezone-aware, conflict detection, mathematical scaling
- **Course Management**: Smart badges, section compatibility (CUHK cohort system), hierarchical cascade clearing
- **Export Functionality**: ICS calendar export with Hong Kong timezone handling for international students
- **Responsive UX**: Cross-platform scrolling, flex-wrap layout, educational tooltips
- **Data Architecture**: Type-safe validation, localStorage persistence, hybrid sync

**Recent Completions:**
- **Calendar Export**: Full ICS implementation with moment-timezone for exchange students
- **Layout Optimization**: Flex-wrap architecture preventing horizontal overflow
- **Weekend Integration**: Full Saturday/Sunday course support with self-loop-free filtering
- **Screenshot System**: Modular architecture with configuration-driven design
- **Term-Scoped Search Fix**: Fixed instructor search to only match current term data

## Core Implementation Details

**Calendar Export (moment-timezone):**
```typescript
// Hong Kong timezone conversion for international students
const hongKongTime = moment.tz(timeString, 'Asia/Hong_Kong').utc()

// ICS event with proper formatting
{
  title: `${course.subject}${course.courseCode} ${section.sectionType}`,
  description: `📚 ${course.title}\n\n👨‍🏫 ${instructorLabel}: ${instructorText}`,
  startInputType: 'utc',
  startOutputType: 'utc'
}
```

**Section Compatibility (CUHK System):**
```typescript
// A-LEC pairs with AE01-EXR (same A-cohort)
// --LEC, -E01-EXR are universal wildcards
// Hierarchical priority: LEC → EXR → TUT → LAB
const prefix1 = getSectionPrefix(section1.sectionCode) // "A" or null
const prefix2 = getSectionPrefix(section2.sectionCode)
return prefix1 === null || prefix2 === null || prefix1 === prefix2
```

**Responsive Layout:**
```typescript
// Smart button wrapping maintaining equal margins
<div className="flex flex-wrap items-center gap-1">
  <Button className="min-w-[100px] flex-shrink-0">Course Outline</Button>
  <Button className="min-w-[100px] flex-shrink-0">Course Reviews</Button>
  <Button className="min-w-[85px] flex-shrink-0">Past Papers</Button>
</div>
```

## Known Issues & Future Considerations

**Critical Issues to Address:**
- **Partial Data Loading**: App continues with incomplete data when network fails mid-load (~50MB, 259 files)
  - False "course no longer exists" errors when sync runs with partial data
  - Need all-or-nothing loading with retry mechanism and user feedback
- **Analytics Gap**: No performance metrics for ~50MB data loading duration and user experience

**Current Limitations:**
- Loads all subjects on startup (200+ files) instead of on-demand
- No live enrollment updates during active sessions
- Shopping cart limited section cycling for orphan sections

**Architecture Debt Items:**
- WeeklyCalendar props could use defaults instead of optional typing
- Subject loading could be optimized with analytics-driven preloading
- Could benefit from lazy loading for non-essential subjects

## 🔄 Immediate TODOs

**High Priority (Data Integrity):**
1. **Implement All-or-Nothing Loading**: Prevent app from proceeding with incomplete course data
   - Add loading error states with retry mechanism
   - Protect sync logic from running with partial data
   - Show clear user feedback when loading fails

**Medium Priority (Analytics & UX):**
2. **Add Data Loading Performance Metrics**: Track loading duration and success rates
   ```typescript
   analytics.dataLoadCompleted(durationSeconds, dataSizeMB, successRate)
   ```
3. **Cross-Term Search Enhancement**: Consider showing other-term matches with clear separation
   - Phase 1: Current term only (implemented)
   - Phase 2: Separated results with visual distinction

**Future Architecture (Long-term):**
4. **Term-Scoped Data Architecture**: Consider TermSpecificCourse model to eliminate repeated term extraction
5. **Intelligent Subject Loading**: Load popular subjects first, others on-demand

## Quality Standards

**Build Requirements:**
- `npm run build` must pass with zero errors/warnings
- No `any` types outside `validation.ts` boundary
- All external data validated through Zod schemas
- TypeScript strict mode compliance

**Code Organization:**
- `validation.ts`: External data + transformation (only file with `any`)
- `types.ts`: Clean internal domain models
- `courseUtils.ts`: Pure functions using internal types
- Components: Internal types exclusively

## Infrastructure Status

**Production Environment:**
- **Hosting**: Cloudflare Pages (zero cost, unlimited Edge requests)
- **Analytics**: PostHog with ad blocker bypass (`/x8m2k` proxy)
- **Performance**: <1s load times, session caching, parallel JSON loading
- **Timezone Support**: Hong Kong UTC+8 with moment-timezone for international users

**Development Environment:**
- **Type Safety**: Zero `any` types, complete runtime validation
- **Testing**: Debug logging for timezone verification
- **Performance**: Clean builds, optimal bundle sizes
- **Architecture**: Component decoupling, bidirectional selection patterns

*Last updated: September 2025 - Production-ready system with term-scoped search, calendar export, and responsive layout. Critical data integrity improvements needed for partial loading scenarios.*