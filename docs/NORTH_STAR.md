# North Star — Titan Life OS

## Problem Statement

Ambitious professionals write down life goals every year — financial targets, fitness milestones, relationship commitments, personal growth plans — then put the notebook away. The goals don't get revisited, daily actions don't connect to long-term vision, and by December most items are untouched. There is no unified system that keeps life goals present daily, intelligently connects today's actions to this year's declared outcomes, and manages the complexity of running multiple businesses, maintaining health, nurturing family, and growing personally — all at once.

**Who it's broken for:** Entrepreneurs and multi-business operators juggling finances, health, family, and personal growth across disconnected tools (notebooks, Asana, email, calendar) with no intelligent layer tying it together.

**What they do instead:** Write plans in notebooks that get shelved. Use Kanban boards (Asana) where yesterday's tasks disappear. Manually manage email triage. Context-switch between tools with no awareness of each other.

**Why now:** AI is mature enough to serve as an intelligent assistant that categorizes, prioritizes, and coaches in real-time. Local-first databases (RxDB) enable offline-capable apps. The founder needs this system personally and sees a market opportunity via a brokerage partnership with 100+ real estate agents.

---

## Vision

Titan Life OS is the AI-first Central Command Center for your entire life. It combines a morning priming ritual, intelligent planning with persistent task tracking, calendar management, email triage, and a Wheel of Life progress radar — all connected by an AI advisor that ensures daily actions align with declared life goals. Every task checked off visibly moves the needle. Nothing gets dropped. The system learns what works and coaches you toward balanced, intentional growth.

---

## Users & Use Cases

### Primary User: The Operator

- **Role:** Entrepreneur / multi-business operator / family person
- **Context:** Runs multiple businesses (real estate, property management, AI lab), has a spouse and two young children, trains for endurance events, maintains active community involvement
- **Pain points:**
  - Goals written down and forgotten — no daily reinforcement
  - Tasks from yesterday disappear in current tools (Asana Kanban)
  - Email inbox is overwhelming — no intelligent triage
  - Calendar conflicts and overbooking
  - No single view of life balance across all domains
  - Context-switching between disconnected tools
- **Key use cases:**
  1. Morning priming → plan the day → execute with clarity
  2. Brain dump everything → AI categorizes and prioritizes → time block the high-leverage items
  3. Triage email → AI drafts responses → achieve inbox zero daily
  4. See at a glance: am I growing symmetrically across life categories or neglecting key areas?
  5. Never lose a task — everything auto-rolls and stays visible until done or dismissed

### Future Users (V2+)

- **Real estate agents** via brokerage partnership — simplified planning + email tools
- **Knowledge workers** — tiered product (planner-only, email-only, full suite)

---

## Success Metrics

| ID | Metric | Target | Baseline | Timeline |
|----|--------|--------|----------|----------|
| SM-1 | Daily personal usage | Used every day, positive experience | Not usable | Immediate |
| SM-2 | Inbox zero achievement | 5+ days per week | No email integration | 1 month |
| SM-3 | Calendar sync reliability | Bidirectional Google Calendar, zero missed conflicts | Partial code exists | 1 month |
| SM-4 | Active beta users | 10 users actively using | 0 | 1 month |
| SM-5 | Task persistence | Zero dropped tasks — 100% auto-rollover | Not implemented | 1 month |
| SM-6 | Revenue generation | Paying customers on tiered plans | $0 | 6 months |

---

## Constraints

| ID | Constraint | Type |
|----|-----------|------|
| C-1 | Desktop-first (MVP). Mobile is V2. | Platform |
| C-2 | Offline-capable (local-first with RxDB) | Architecture |
| C-3 | Google Calendar bidirectional sync | Integration |
| C-4 | Gmail API integration (read, categorize, draft, send) | Integration |
| C-5 | Real-time, fast loading (< 2s initial load) | Performance |
| C-6 | No exposed API keys. Key rotation. Prompt injection protection. | Security |
| C-7 | Personal data encrypted and protected | Privacy |
| C-8 | Single-user architecture (multi-tenant is V2) | Architecture |
| C-9 | Persistent task list — unfinished tasks auto-roll daily | Behavior |
| C-10 | Health nudges: hydration (20-30 min), stretch (45 min), eye breaks | Behavior |
| C-11 | User-defined life categories (not hardcoded) | Flexibility |
| C-12 | Glassmorphism UI aesthetic (frosted glass) | Design |
| C-13 | Drag-and-drop dashboard cards (Grafana-style) | UX |

---

## Out of Scope (V1)

| ID | Item | Rationale | Revisit |
|----|------|-----------|---------|
| OOS-1 | Financial dashboards (bank/credit card APIs) | Complex integrations, cost unknown | V2 |
| OOS-2 | Health device integrations (Zepp/Amazfit, Ring Con) | API research needed | V2 |
| OOS-3 | Detailed health metrics (sleep, HRV, fitness data) | Depends on OOS-2 | V2 |
| OOS-4 | Mobile app | Desktop-first, responsive web as interim | V2 |
| OOS-5 | Multi-user / tiered product rollout | Need onboarding template from underwriting app | V2 |
| OOS-6 | Vision Board (dynamic AI reminders) | Personal feature, continue in sandbox | V2 |
| OOS-7 | Family Hub (wife calendar sync, vacation planning, shopping) | Complex, lower priority than core planning | V2 |
| OOS-8 | Full AI Executive Assistant (anticipatory, proactive) | V1 has AI suggestions; full EA is V2 | V2 |

---

## Failure Criteria

| ID | Condition | Why It's Failure |
|----|-----------|-----------------|
| FC-1 | Gmail integration doesn't connect or work reliably | Core V1 feature — broken email = unusable |
| FC-2 | AI can't distinguish urgent vs important vs spam | Email triage is pointless without accuracy |
| FC-3 | Can't actually unsubscribe from spam | Must reduce noise, not just sort it |
| FC-4 | Email organization doesn't achieve inbox zero | The whole point of email feature |
| FC-5 | Too many bugs — features don't do what they claim | Trust is lost, usage drops |
| FC-6 | User stops using it after a week | Must be less friction than current workflow |
| FC-7 | Tasks still get dropped — auto-rollover doesn't work | The #1 frustration with current tools |

---

## Risks & Mitigations

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|-----------|------------|
| R-1 | Gmail API rate limits / OAuth complexity | Email feature delayed | Medium | Research Gmail API quotas early. Use batch endpoints. Implement proper OAuth flow with token refresh. |
| R-2 | AI suggestion quality is poor | Users ignore AI, feature is useless | Medium | Start with rule-based prioritization (Eisenhower matrix + goal alignment). Layer AI on top. Always show reasoning. |
| R-3 | Google Calendar sync conflicts / data loss | Calendar becomes unreliable | Medium | Implement conflict detection before write. Never delete without confirmation. Audit log for all calendar operations. |
| R-4 | Scope creep from V2 features | V1 never ships | High | Strict scope boundary. Deferred ideas list in scorecard. "Captured for later" protocol. |
| R-5 | RxDB/Supabase sync issues at scale | Data inconsistency, lost tasks | Low | Test offline→online sync thoroughly. Conflict resolution strategy. Checkpoint data integrity. |

---

## Related Documents

- [MVP Definition](./MVP.md) — Features with acceptance criteria
- [Milestones](./MILESTONES.md) — Phased roadmap with tasks
- [Project Scorecard](./PROJECT_SCORECARD.md) — Live dashboard tracking all requirements
