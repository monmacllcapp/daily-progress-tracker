# MVP Definition — Titan Life OS

## Core Value Proposition

Titan Life OS is the smallest system that makes your daily planning intelligent and persistent. You prime your mindset each morning, brain dump everything on your plate, and the AI helps you focus on what matters most — with nothing ever getting dropped. Your calendar stays synced, your email gets triaged to zero, and a Wheel of Life shows whether you're growing in balance or neglecting key areas.

**Smallest shippable product:** Morning priming + AI-powered persistent planning + Google Calendar sync + Gmail triage + Wheel of Life progress tracking.

---

## In-Scope Features

### Feature 1: Morning Priming Flow

**User Story:** As an operator, I want to start each day with a structured priming ritual so that I'm mentally anchored and clear on what matters before I start working.

**Description:** A guided 3-step morning flow that captures gratitude, identifies the day's non-negotiable wins, and surfaces stressors. Completing the flow feeds items directly into the day's task list.

**Acceptance Criteria:**
- [ ] AC-1.1: User can enter 3 gratitude items each morning
- [ ] AC-1.2: User is prompted "What are 3 things that if you did today, you'd feel like it's a big win?" and can enter 3 non-negotiables
- [ ] AC-1.3: User can enter stressors ("things that if knocked off your plate, you'd feel relief")
- [ ] AC-1.4: Completing morning flow creates corresponding tasks in the persistent task list
- [ ] AC-1.5: Morning flow triggers once per day (auto-resets at 6 AM)
- [ ] AC-1.6: All morning entries persist and are viewable in historical journal
- [ ] AC-1.7: Habit checklist included (hydration, meditation, movement, deep work)

**Technical Requirements:**
- DailyJournal entity with gratitude[], non_negotiables[], stressors[], habits{}
- Auto-creation of Task entities from non-negotiables and stressors
- Daily reset worker (6 AM trigger)
- Animated step-by-step wizard UI with glassmorphism

**Definition of Done:** Morning flow works end-to-end. All entries persist in RxDB. Tasks auto-created. Journal history viewable. No stubs, no TODOs.

---

### Feature 2: RPM Planning + Persistent Task List

**User Story:** As an operator, I want to brain dump everything on my mind, have the AI categorize and prioritize it, and never lose track of unfinished tasks — so I always know what's most important and nothing gets dropped.

**Description:** The core planning engine. Users capture tasks freely (brain dump). AI categorizes into life buckets, identifies highest-leverage items tied to declared goals, and re-prioritizes daily. Unfinished tasks automatically roll to the next day. The list is always visible, always current.

**Acceptance Criteria:**
- [ ] AC-2.1: User can brain dump tasks freely (quick capture input)
- [ ] AC-2.2: AI categorizes tasks into user-defined life categories
- [ ] AC-2.3: AI identifies and surfaces highest-leverage tasks ("Based on your goals, I recommend focusing on...")
- [ ] AC-2.4: Unfinished tasks auto-roll to the next day — nothing ever disappears
- [ ] AC-2.5: User can view full task history (what was planned Monday still visible Tuesday)
- [ ] AC-2.6: Tasks can be marked complete, dismissed, or deferred with reason
- [ ] AC-2.7: Each task shows which life category and goal it connects to
- [ ] AC-2.8: Quick-win detection: tasks estimated < 5 minutes are grouped for batch execution
- [ ] AC-2.9: Progress bar updates visibly when tasks are checked off (gamification)
- [ ] AC-2.10: RPM wizard available: define Result → Purpose → Massive Action plan with subtasks and time estimates

**Technical Requirements:**
- Task entity with: id, title, category_id, goal_id, time_estimate, priority, status (active/completed/dismissed/deferred), created_date, due_date, rolled_from_date
- Auto-rollover service: at daily reset, move incomplete tasks to new day
- AI categorization endpoint (Gemini or local model)
- RPM wizard: Project + SubTask creation with time estimates
- Real-time reactive list (RxDB subscriptions)

**Definition of Done:** Can capture tasks, see AI categorization, get leverage suggestions, check off with progress feedback. Tasks from yesterday appear today. RPM wizard creates projects with subtasks. All persisted in RxDB. Tested end-to-end.

---

### Feature 3: Google Calendar Sync + Time Blocking

**User Story:** As an operator, I want my planned tasks to appear as time blocks on my Google Calendar, and my calendar events to appear in the app — so everything is in one place and conflicts are caught.

**Description:** Bidirectional Google Calendar integration. Tasks get time estimates and are blocked on the calendar. Calendar events appear in the daily view. Conflict detection prevents overbooking. Quick-win tasks are batched into 30-minute power blocks.

**Acceptance Criteria:**
- [ ] AC-3.1: Google Calendar OAuth2 authentication flow works (connect/disconnect)
- [ ] AC-3.2: Calendar events from Google appear in the app's daily view
- [ ] AC-3.3: Tasks with time estimates can be scheduled as calendar events
- [ ] AC-3.4: Quick-win tasks (< 5 min) grouped into 30-minute power blocks on calendar
- [ ] AC-3.5: Conflict detection alerts when scheduling overlapping events
- [ ] AC-3.6: Deep work blocks can be scheduled with "do not disturb" designation
- [ ] AC-3.7: Bidirectional sync — changes in Google Calendar reflect in app and vice versa
- [ ] AC-3.8: Daily agenda view shows all calendar events + planned tasks in timeline format

**Technical Requirements:**
- Google Calendar API v3 integration (existing service needs extension)
- OAuth2 flow with token refresh and secure storage
- CalendarEvent entity synced with Google
- TimeBlock entity linking tasks to calendar slots
- Conflict detection service (existing, needs refinement)
- Daily agenda component with timeline view

**Definition of Done:** Can authenticate with Google, see calendar events, schedule tasks as time blocks, detect conflicts. Sync is bidirectional and reliable. Power blocks work. Tested with real Google Calendar.

---

### Feature 4: Gmail Email Management

**User Story:** As an operator, I want my emails automatically triaged into categories with AI-drafted responses — so I can achieve inbox zero daily with minimal effort.

**Description:** Gmail API integration that reads emails, auto-categorizes into tiers (spam/unsubscribe, promotions, important-not-urgent, urgent), and drafts responses in the user's voice. The user reviews, edits if needed, and sends with one click.

**Acceptance Criteria:**
- [ ] AC-4.1: Gmail OAuth2 authentication flow works (connect/disconnect)
- [ ] AC-4.2: Emails auto-categorized into 4 tiers: Unsubscribe, Promotions, Important, Urgent
- [ ] AC-4.3: Unsubscribe tier: one-click unsubscribe from mailing lists
- [ ] AC-4.4: AI drafts response for Important and Urgent emails in user's writing style
- [ ] AC-4.5: User can review, edit, and send AI-drafted responses
- [ ] AC-4.6: Processed emails are archived/moved, achieving inbox zero
- [ ] AC-4.7: Email dashboard shows count per tier and progress toward zero
- [ ] AC-4.8: User can reclassify emails if AI categorization was wrong (feedback loop)

**Technical Requirements:**
- Gmail API integration (read, modify labels, send, unsubscribe)
- OAuth2 flow (can share Google auth with Calendar)
- Email entity: id, subject, from, tier, ai_draft, status (unread/triaged/responded/archived)
- AI email classifier (Gemini — analyze subject, sender, content)
- AI response drafter (Gemini — learn user's writing style from sent emails)
- Email management UI with tier tabs and action buttons

**Definition of Done:** Can authenticate Gmail, see emails categorized into 4 tiers, unsubscribe from spam, review AI drafts, send responses, achieve inbox zero. Categorization accuracy improves with user feedback. Tested with real Gmail.

---

### Feature 5: Wheel of Life + Gamification

**User Story:** As an operator, I want to see a visual radar of my progress across all life categories — so I can tell at a glance whether I'm growing in balance or neglecting key areas, and feel motivated when I make progress.

**Description:** A customizable Wheel of Life radar chart. Users define their own life categories and set milestones within each. As tasks are completed and milestones hit, the radar grows. Progress bars and gamification elements (streaks, celebrations) make checking off tasks rewarding.

**Acceptance Criteria:**
- [ ] AC-5.1: User can create, edit, and delete custom life categories
- [ ] AC-5.2: Each category has milestones with micro-actions (subtasks)
- [ ] AC-5.3: Radar chart updates in real-time as milestones are completed
- [ ] AC-5.4: Can see at a glance which life areas are strong vs lagging (symmetry view)
- [ ] AC-5.5: Progress bar animates visibly when tasks are checked off
- [ ] AC-5.6: Streak tracking — consecutive days of activity per category
- [ ] AC-5.7: Celebration feedback on milestone completion (animation, message)
- [ ] AC-5.8: Health nudges fire on schedule (hydration 20-30 min, stretch 45 min, eye breaks)

**Technical Requirements:**
- Category entity: user-defined, with color_theme, current_progress (0.0-1.0), streak_count, last_active_date
- Milestone entity: linked to category, with subtasks
- Radar chart component (SVG, extend existing WheelOfLife.tsx)
- Progress bar animations (Framer Motion)
- Gamification service: streak calculation, celebration triggers
- Health nudge workers (existing, may need tuning)

**Definition of Done:** Custom categories work. Milestones with subtasks track progress. Radar updates live. Streaks calculate correctly. Health nudges fire on schedule. Celebrations feel rewarding. All persisted in RxDB.

---

## Out of Scope (V1)

| Feature | Rationale | Revisit |
|---------|-----------|---------|
| Vision Board (dynamic AI reminders) | Personal feature, continue in sandbox | V2 |
| Financial dashboards (bank/credit card APIs) | Complex integrations, cost TBD | V2 |
| Health device integrations (Zepp, Ring Con) | API research needed | V2 |
| Family Hub (wife calendar, vacation, shopping) | Lower priority than core planning | V2 |
| Full AI Executive Assistant (anticipatory) | V1 has AI suggestions; full EA is V2 | V2 |
| Mobile app | Desktop-first | V2 |
| Multi-user / onboarding | Template from underwriting app | V2 |

---

## Success Criteria

### Functional
- [ ] Morning priming flow works end-to-end daily
- [ ] Tasks persist across days — nothing ever dropped
- [ ] AI categorizes tasks into correct life buckets > 80% of the time
- [ ] Google Calendar syncs bidirectionally without data loss
- [ ] Gmail triage categorizes accurately and achieves inbox zero
- [ ] Wheel of Life updates as progress is made

### Technical
- [ ] Page loads in < 2 seconds
- [ ] Works offline (local-first with RxDB)
- [ ] No exposed API keys or secrets
- [ ] All features have tests passing
- [ ] Zero lint errors, TypeScript strict mode

### Business
- [ ] Founder uses it daily and enjoys the experience
- [ ] 10 beta users active within 1 month
- [ ] No critical bugs blocking daily use

---

## Architecture

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS 4 + Framer Motion (glassmorphism) |
| State | Zustand (UI state) + RxDB (persistent data) |
| Database | RxDB with Dexie storage (IndexedDB) |
| Cloud Sync | Supabase (optional, for backup/multi-device) |
| AI | Google Generative AI (Gemini) |
| Calendar | Google Calendar API v3 |
| Email | Gmail API |
| Auth | Google OAuth2 (shared for Calendar + Gmail) |
| Dashboard | react-grid-layout (drag-and-drop cards) |
| Workers | Web Workers (daily reset, health nudges) |

### Data Model

```
DailyJournal
├── id, date
├── gratitude[], non_negotiables[], stressors[]
├── habits{}
└── created_at

Task (NEW — central entity)
├── id, title, description
├── category_id → Category
├── goal_id → Project (optional)
├── time_estimate_minutes
├── priority (urgent-important matrix)
├── status (active | completed | dismissed | deferred)
├── source (morning_flow | brain_dump | rpm_wizard | email | calendar)
├── created_date, due_date, rolled_from_date
├── completed_date
└── sort_order

Project (RPM "Result")
├── id, title, status
├── motivation_payload { why, impact_positive, impact_negative }
├── category_id → Category
├── due_date
└── 1-to-many → SubTask (milestones)

SubTask
├── id, project_id, title
├── time_estimate_minutes, time_actual_minutes
├── is_completed, sort_order
└── completed_date

Category (user-defined life buckets)
├── id, name, color_theme
├── current_progress (0.0-1.0)
├── streak_count, last_active_date
└── sort_order

Email (NEW)
├── id, gmail_id, thread_id
├── subject, from, snippet
├── tier (unsubscribe | promotion | important | urgent)
├── ai_draft
├── status (unread | triaged | responded | archived)
└── received_at

CalendarEvent (NEW)
├── id, google_event_id
├── title, start, end
├── task_id → Task (optional)
├── type (meeting | time_block | deep_work | power_block)
└── synced_at

VisionBoard (V2 — exists in sandbox)
Stressor / StressorMilestone (merge into Task system)
```

### System Diagram

```
┌─────────────────────────────────────────────────┐
│  Google APIs                                     │
│  ├── Calendar API v3 (bidirectional sync)        │
│  ├── Gmail API (read, categorize, draft, send)   │
│  └── OAuth2 (shared auth for both)               │
└──────────────┬──────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────┐
│  Services Layer                                  │
│  ├── CalendarSyncService                         │
│  ├── EmailTriageService                          │
│  ├── AIAdvisorService (Gemini)                   │
│  ├── TaskRolloverService                         │
│  └── GamificationService                         │
└──────────────┬──────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────┐
│  RxDB Database (IndexedDB via Dexie)             │
│  ├── tasks, projects, sub_tasks                  │
│  ├── daily_journal, categories                   │
│  ├── emails, calendar_events                     │
│  └── ↔ Supabase (cloud sync when online)         │
└──────────────┬──────────────────────────────────┘
               │ (Reactive subscriptions)
┌──────────────▼──────────────────────────────────┐
│  React UI (Glassmorphism + react-grid-layout)    │
│  ├── MorningFlow wizard                          │
│  ├── TaskDashboard (persistent list + AI)        │
│  ├── CalendarView (daily agenda + time blocks)   │
│  ├── EmailDashboard (4-tier triage)              │
│  ├── WheelOfLife (radar + gamification)           │
│  └── RPMWizard (capture → plan → action)         │
└─────────────────────────────────────────────────┘
```
