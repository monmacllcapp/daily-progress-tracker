# Handoff — Calendar Views Complete + Pepper Hallucination

## What Was Done (This Session)
- **Timezone fix**: Normalized Google Calendar event times to UTC ISO in `google-calendar.ts`
- **Calendar utils**: Created shared `calendar-utils.ts` (formatHour, assignColumns, deduplicateEvents, etc.)
- **WeekView**: New 7-column Sun-Sat timeline component
- **MonthView**: New calendar grid with event pills and "+N more" overflow
- **CalendarPage**: Updated with Day/Week/Month tabs (defaults to week)
- **DailyAgenda**: Refactored to use shared utils, accepts controlled props, applies dedup
- **Google OAuth**: Set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET as Supabase Edge Function secrets
- **Supabase**: Service key added to alpha-ai .env, OpenClaw restarted
- **Pepper**: Added anti-hallucination guardrail to SOUL.md
- **Build**: `tsc --noEmit` passes clean

## Pepper Hallucination Root Cause
- All agents still on `ollama/llama3.1:latest` (IDENTITY.md files never updated to Gemini)
- No Gemini API key in `~/alpha-ai/.env` — only Ollama config exists
- Ollama/Llama can't execute tools — just generates text, makes up data
- Interim fix: anti-hallucination guard added to SOUL.md
- Real fix: add Gemini API key + update OpenClaw config

## Files Changed
| File | Action |
|------|--------|
| `src/services/google-calendar.ts` | EDIT (timezone normalization) |
| `src/components/calendar/calendar-utils.ts` | NEW |
| `src/components/calendar/WeekView.tsx` | NEW |
| `src/components/calendar/MonthView.tsx` | NEW |
| `src/components/DailyAgenda.tsx` | EDIT (shared utils + dedup) |
| `src/pages/CalendarPage.tsx` | EDIT (Day/Week/Month tabs) |
| `~/alpha-ai/agents/ea-user/SOUL.md` | EDIT (anti-hallucination guard) |

## Next Steps
1. User provides Gemini API key → add to `~/alpha-ai/.env`
2. Update `openclaw.json` to use Gemini provider (needs sudo on desktop)
3. Update all agent IDENTITY.md files to reflect Gemini model
4. Test calendar views in browser
5. Commit all changes and push to sandbox
6. SSH hardening on desktop (Task #10)

## Blockers
- Gemini API key needed from user
- openclaw.json update needs sudo on desktop
