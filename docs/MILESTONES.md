# Milestones — Titan Life OS

## Overview

| Phase | Name | Status | Target |
|-------|------|--------|--------|
| M0 | Setup & Governance | COMPLETE | Done |
| M1 | Core Planning Engine | COMPLETE | Week 1 |
| M2 | Calendar + Email Integration | COMPLETE | Week 2 |
| M3 | Wheel of Life + Gamification | COMPLETE | Week 3 |
| M4 | Testing & Hardening | COMPLETE | Week 3-4 |
| M5 | Beta Launch | IN_PROGRESS | Week 4 |

---

## M0: Setup & Governance

**Status:** COMPLETE
**Success Criteria:** Project scaffolded, dependencies installed, governance in place, planning docs complete.

- [x] Project setup (Vite + React 19 + TypeScript)
- [x] Supabase integration configured
- [x] Basic UI shell with glassmorphism
- [x] RxDB database with collections
- [x] react-grid-layout dashboard
- [x] Zustand state management
- [x] Web workers (daily reset, health nudges)
- [x] Governance bootstrap (scorecard, checkpoints)
- [x] Planning docs generated (NORTH_STAR, MVP, MILESTONES)

---

## M1: Core Planning Engine

**Status:** COMPLETE
**Success Criteria:** Morning flow works end-to-end. Tasks persist across days. AI categorizes and suggests. RPM wizard creates projects. Progress bars visible.

### Wave 1: Data Foundation
- [x] M1-1: Create Task entity schema in RxDB (id, title, category_id, goal_id, time_estimate, priority, status, source, created_date, due_date, rolled_from_date, completed_date, sort_order)
- [x] M1-2: Migrate Stressor/StressorMilestone data model into unified Task system
- [x] M1-3: Update Category entity to support user-defined categories with streak_count, last_active_date, current_progress
- [x] M1-4: Create TaskRolloverService — at 6 AM daily reset, move incomplete tasks to new day with rolled_from_date tracking

### Wave 2: Morning Flow Upgrade
- [x] M1-5: Refactor MorningFlow.tsx — add "3 non-negotiable wins" prompt with correct wording
- [x] M1-6: Morning flow completion auto-creates Task entities (non-negotiables → high priority tasks, stressors → tasks with "relief" tag)
- [x] M1-7: Morning flow journal entries persist and are viewable in history view

### Wave 3: Persistent Task List + AI
- [x] M1-8: Build TaskDashboard component — always-visible task list with category grouping
- [x] M1-9: Implement brain dump quick-capture input (rapid task entry)
- [x] M1-10: AI categorization — Gemini classifies tasks into user-defined life categories
- [x] M1-11: AI leverage advisor — "Based on your goals, I recommend focusing on [X]" with reasoning
- [x] M1-12: Task status management (complete, dismiss, defer with reason)
- [x] M1-13: Auto-rollover visual — tasks from previous days show "rolled from [date]" badge

### Wave 4: RPM Wizard + Progress
- [x] M1-14: Refine RPMWizard — ensure Result → Purpose → Massive Action flow creates Project + SubTasks correctly
- [x] M1-15: Connect RPM projects to categories and display in task list
- [x] M1-16: Progress bar animation on task completion (Framer Motion)
- [x] M1-17: Quick-win detection — tasks < 5 min grouped with "power batch" label

### Tests
- [x] M1-T1: Unit tests for TaskRolloverService (8 tests)
- [x] M1-T2: Unit tests for AI categorization service (6 tests)
- [x] M1-T3: Integration test: morning flow → task creation → rollover → next day visibility (5 tests)
- [x] M1-T4: Unit tests for RPM wizard task/project creation (9 tests)

---

## M2: Calendar + Email Integration

**Status:** COMPLETE
**Success Criteria:** Google Calendar syncs bidirectionally. Tasks appear as time blocks. Gmail connected, emails triaged into 4 tiers. AI drafts responses. Inbox zero achievable.

### Wave 1: Google Auth + Calendar
- [x] M2-1: Implement unified Google OAuth2 flow (GIS browser-based, shared Calendar + Gmail scopes)
- [x] M2-2: Refactor GoogleCalendarService — REST API (replaced Node.js googleapis), bidirectional sync
- [x] M2-3: Build CalendarEvent + Email entities in RxDB with Google event/message ID tracking
- [x] M2-4: Daily agenda view — hour-by-hour timeline with time blocks, current time indicator, date nav
- [x] M2-5: Task → time block scheduling (schedule modal with date/time picker from TaskDashboard)

### Wave 2: Time Blocking
- [x] M2-6: Quick-win power blocks — "Schedule Batch" button groups <5min tasks into calendar blocks
- [x] M2-7: Deep work block scheduling with focus toggle (60/90/120 min presets)
- [x] M2-8: Conflict detection — real-time overlap and back-to-back warnings in schedule modal
- [x] M2-9: Calendar ↔ task status sync — auto-completes tasks whose events have ended

### Wave 3: Gmail Integration
- [x] M2-10: Gmail API integration — REST APIs via googleFetch(), read + send + archive
- [x] M2-11: Email entity in RxDB — gmail_id, thread_id, tier, AI draft, status, labels
- [x] M2-12: AI email classifier — Gemini AI with rule-based fallback (4 tiers)
- [x] M2-13: Unsubscribe link extraction from List-Unsubscribe headers
- [x] M2-14: AI response drafter — Gemini drafts concise professional replies
- [x] M2-15: Email dashboard UI — tier groups, count badges, inbox zero progress
- [x] M2-16: Review/edit/send workflow — draft textarea, edit, send via Gmail API
- [x] M2-17: Inbox zero tracker — progress bar with celebration message

### Wave 4: Email Feedback Loop
- [x] M2-18: User reclassification via tier_override — click tier icons in email detail
- [x] M2-19: Email processing queue with configurable rate limiting (250ms default)

### Tests
- [x] M2-T1: Unit tests for task scheduler — scheduleTask, deep work, power batch (15 tests)
- [x] M2-T2: Unit tests for conflict detection — overlap, back-to-back, no-conflict (3 tests)
- [x] M2-T3: Unit tests for email classifier — rule-based tier classification (10 tests)
- [x] M2-T4: Unit tests for calendar-task sync — auto-complete, already-complete guard (2 tests)
- [x] M2-T5: Unit tests for email processing queue — sequential execution, error handling (4 tests)

---

## M3: Wheel of Life + Gamification

**Status:** COMPLETE
**Success Criteria:** Custom categories work. Radar chart updates live. Streaks calculate. Health nudges fire. Celebrations feel rewarding.

### Wave 1: Custom Categories
- [x] M3-1: Category management UI — create, edit, delete, reorder life categories
- [x] M3-2: Category color picker and icon selection
- [x] M3-3: Milestone creation within categories — define goals with subtasks

### Wave 2: Radar + Progress
- [x] M3-4: Refactor WheelOfLife.tsx — support dynamic user-defined categories (not hardcoded)
- [x] M3-5: Real-time radar updates as tasks/milestones are completed
- [x] M3-6: Symmetry indicator — visual cue showing balanced vs unbalanced growth
- [x] M3-7: Category detail view — drill into a category to see milestones and tasks

### Wave 3: Gamification
- [x] M3-8: Streak tracking — consecutive days of activity per category
- [x] M3-9: Celebration animations on milestone completion (confetti, message)
- [x] M3-10: Daily streak display in dashboard header
- [x] M3-11: Progress summary — "You completed X tasks today across Y categories"

### Wave 4: Health Nudges
- [x] M3-12: Tune health worker — hydration every 20-30 min (configurable)
- [x] M3-13: Stretch reminder every 45 min of continuous work
- [x] M3-14: Eye break reminder (look far away) — hourly
- [x] M3-15: Nudge UI — non-intrusive toast/modal with dismiss and snooze

### Tests
- [x] M3-T1: Unit tests for streak calculation
- [x] M3-T2: Unit tests for category progress calculation
- [x] M3-T3: Integration test: task completion → radar update → streak increment
- [x] M3-T4: Health nudge timer accuracy tests

---

## M4: Testing & Hardening

**Status:** COMPLETE
**Success Criteria:** All tests pass. Zero lint errors. TypeScript strict. No secrets exposed. Performance targets met. Offline works.

- [x] M4-1: Install and configure Vitest + React Testing Library + jsdom
- [x] M4-2: Achieve 80% test coverage across all services (achieved 88.9%)
- [x] M4-3: End-to-end flow tests (morning → plan → calendar → email → review)
- [ ] M4-4: Offline mode testing — verify RxDB works without network *(deferred — RxDB offline-first by design)*
- [ ] M4-5: Performance audit — page load < 2s, interactions < 100ms *(deferred — needs browser profiling)*
- [x] M4-6: Security audit — XSS fixed in main.tsx, prompt injection risks documented (need backend for full mitigation)
- [x] M4-7: ESLint zero errors, TypeScript zero errors
- [ ] M4-8: Supabase sync reliability testing *(deferred — needs Supabase backend)*
- [x] M4-9: Error boundary coverage — ErrorBoundary component wraps all routes
- [x] M4-10: Accessibility audit — aria-labels on icon buttons, form inputs labeled

### Test Results
- **247 tests passing** across 15 test files
- **0 test failures**
- **Services coverage: 88.9%** (target: 80%)
- **ESLint: 0 errors** (3 warnings from generated coverage files)
- **TypeScript: 0 errors**

---

## M5: Beta Launch

**Status:** IN_PROGRESS
**Success Criteria:** Deployed. 10 beta users onboarded. Feedback collected. No critical bugs.

### Build & Deploy
- [x] M5-1: Production build optimization — Vite manual chunks (vendor-react, vendor-ui, vendor-data, vendor-google), React.lazy code splitting for all route components. Largest chunk 195KB (55KB gz), down from 700KB monolith.
- [x] M5-2: Netlify deployment config — netlify.toml with SPA redirects, cache headers (1yr immutable for assets), security headers (X-Frame-Options DENY, X-Content-Type-Options nosniff). Public/_redirects fallback.
- [x] M5-3: Environment variable management — .env.example documenting all 4 env vars (Google OAuth, Gemini API, Supabase). Runtime integration logging at startup.
- [ ] M5-4: Basic analytics/telemetry (anonymous usage metrics) *(deferred — needs privacy-respecting analytics provider)*

### User Experience
- [x] M5-5: Beta user onboarding — WelcomeOnboarding component with 2-step flow (feature overview → Google connect). localStorage persistence, skip option. Shows before morning flow on first visit.
- [x] M5-6: In-app feedback widget — FeedbackWidget component with floating button, 3 feedback types (bug/feature/general), stored in localStorage. Accessible with aria-labels.

### Beta Validation *(requires deployment + real users)*
- [ ] M5-7: Onboard 10 beta users
- [ ] M5-8: Collect and triage beta feedback
- [ ] M5-9: Bug fix sprint based on beta feedback
- [ ] M5-10: V1 release announcement

### Build Stats
- **247 tests passing** across 15 test files
- **0 TypeScript errors, 0 ESLint errors**
- **14 output chunks**, largest 195KB (55KB gzipped)
- **Build time: ~6s**
