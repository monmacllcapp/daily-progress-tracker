# Agent Topology — Titan Life OS

**Last Updated:** 2026-02-04
**Configuration:** 2-tier (Orchestrator + Dev Team)

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  OPUS 4.5 — Orchestrator                            │
│                                                     │
│  Responsibilities:                                  │
│  - Plan implementation strategy                     │
│  - Coordinate task execution                        │
│  - Review code quality                              │
│  - Make architectural decisions                     │
│  - Create ADRs and checkpoints                      │
│  - Update scorecard and planning docs               │
│  - Synthesize results from dev agents               │
│                                                     │
│  Does NOT:                                          │
│  - Write implementation code directly               │
│  - Execute repetitive tasks                         │
│                                                     │
├─────────────────────────────────────────────────────┤
│  SONNET — Dev Team (via Task tool, model="sonnet")  │
│                                                     │
│  Agent Types:                                       │
│  - feature_agent: Implements features               │
│  - test_agent: Writes and runs tests                │
│  - qa_agent: Lint, type-check, build verification   │
│  - fix_agent: Bug fixes and refactoring             │
│                                                     │
│  Constraints:                                       │
│  - Stay within assigned scope                       │
│  - Do not make architectural decisions              │
│  - Report results to orchestrator                   │
│  - Max 6 concurrent agents                          │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## Task Delegation Pattern

1. Orchestrator reads requirements and plans implementation
2. Orchestrator creates detailed task prompts with ALL context inlined
3. Sonnet agents execute via `Task(model="sonnet", subagent_type="general-purpose")`
4. Orchestrator reviews results, runs QA, and coordinates next wave
5. Orchestrator handles git, docs, and scorecard updates

## File Ownership (Current)

All agents work on `sandbox` branch. No concurrent edits to the same file.

## Spawning Rules

- Max 6 concurrent Sonnet agents
- Independent tasks run in parallel (single message, multiple Task calls)
- Dependent tasks run sequentially (wait for results)
- Each agent gets full context inlined (no @ references across boundaries)
