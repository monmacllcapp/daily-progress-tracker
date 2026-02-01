# Titan Life OS — Beta Test Guide

## Live App

**URL:** https://titan-life-os.onrender.com

## What to Test

### 1. Welcome Onboarding
- First visit shows a welcome screen with feature overview
- "Get Started" leads to Google Connect step
- "Skip for now" bypasses onboarding entirely

### 2. Morning Priming Flow
- Enter 3 gratitude items
- Set 3 "non-negotiable wins" for the day
- Log any stressors for relief
- Complete the habit checklist
- All entries create persistent tasks

### 3. Task Management
- Use "Brain Dump" to quickly capture tasks (one per line)
- AI categorizes tasks into life buckets (requires Gemini API key)
- Tasks persist across days — uncompleted tasks auto-roll to the next day
- Mark tasks complete, dismiss, or defer
- Try the RPM Wizard to create projects with subtasks

### 4. Google Calendar (requires Google OAuth setup)
- Daily agenda timeline shows events hour-by-hour
- Schedule tasks as calendar time blocks
- Conflict detection alerts for overlapping events
- Deep work blocks and power batch scheduling

### 5. Gmail Triage (requires Google OAuth setup)
- Email auto-categorized into 4 tiers: urgent, important, promotions, unsubscribe
- AI drafts responses in your voice
- One-click archive for inbox zero

### 6. Wheel of Life
- Create/edit life categories with colors and icons
- Radar chart shows balance across categories
- Symmetry indicator: balanced vs. unbalanced
- Streak tracking per category

### 7. Gamification
- Health nudges: hydration, stretch, eye break reminders
- Streak tracking with celebration animations
- Daily progress header with completion stats

## Known Limitations (Beta)
- Google integrations require OAuth credentials (Calendar, Gmail, Gemini)
- Without credentials, the app runs in local-only mode (tasks, morning flow, wheel of life all work)
- Data stored in browser IndexedDB — clearing browser data resets everything
- Desktop-first design (mobile not optimized for V1)
- Single-user only

## Submitting Feedback
Click the **feedback button** (bottom-left corner) to report:
- **Bug** — something broken or unexpected
- **Feature request** — something you wish existed
- **General** — any other thoughts

Feedback is stored locally. Share screenshots or descriptions via email if needed.

## Test Account
- Email: monmaclabs@gmail.com
