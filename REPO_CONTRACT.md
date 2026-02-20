# Repository Contract

> **This document is the canonical reference for how this repository operates.**

## Repository Purpose

**maple-life-os** - Personal life operating system built with React, RxDB, and AI integrations.

## Governance Model

This repository follows the **monmacllcapp governance architecture**:
- Single Source of Truth (SSOT) alignment
- Human-signal merge automation
- Quality gates on all PRs

## Branch Strategy

| Branch | Purpose | Protection |
|--------|---------|------------|
| `master` | Production-ready code | Protected |
| `sandbox` | Development integration | PR target |

### Rules

1. **All work** happens on `sandbox` branch
2. **All merges** go through PR: `sandbox` → `master`
3. **Merge signal**: Owner approving review with body `approve`
4. **No direct commits** to `master`

## Required Files

Every PR must include these files:

- `README.md` - Project documentation
- `REPO_CONTRACT.md` - This file
- `SSOT_POINTER.md` - SSOT version reference
- `CONTRIBUTING.md` - Contribution guidelines
- `.github/CODEOWNERS` - Code ownership
- `.github/SECURITY.md` - Security policy

## Quality Gates

All PRs must pass:

- [ ] Branch validation (from `sandbox`)
- [ ] Required files check
- [ ] Secret scanning (TruffleHog)
- [ ] Linting (ESLint)
- [ ] Type checking (TypeScript)
- [ ] Dependency review (CVE/license)

## Merge Process

1. Create PR from `sandbox` → `master`
2. Wait for all checks to pass
3. Owner submits approving review with body: `approve`
4. Bot automatically merges (squash)

## Contact

- **Owner**: @monmacllcapp
- **Governance**: [monmacllcapp/governance](https://github.com/monmacllcapp/governance)
