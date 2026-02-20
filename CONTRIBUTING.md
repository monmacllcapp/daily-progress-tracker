# Contributing to maple-life-os

Thank you for your interest in contributing!

## Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy environment file: `cp .env.example .env`
4. Start development: `npm run dev`

## Development Workflow

### Branch Strategy

1. **Always work on `sandbox` branch**
   ```bash
   git checkout sandbox
   git pull origin sandbox
   ```

2. **Make your changes**
   - Follow existing code patterns
   - Run linting: `npm run lint`
   - Run build: `npm run build`

3. **Commit with conventional format**
   ```bash
   git commit -m "feat: add new feature"
   git commit -m "fix: resolve bug"
   ```

4. **Push to sandbox**
   ```bash
   git push origin sandbox
   ```

### Creating a Pull Request

1. Go to GitHub and create PR: `sandbox` → `master`
2. Fill out the PR template completely
3. Wait for all checks to pass
4. Request review from @monmacllcapp

### Merge Process

Only the repository owner can merge PRs:
1. Owner reviews the PR
2. Owner submits approving review with body: `approve`
3. Bot automatically merges

## Code Standards

### TypeScript

- Use strict TypeScript
- Define types/interfaces for all data structures
- Avoid `any` type

### React

- Use functional components with hooks
- Use Zustand for state management
- Follow existing component patterns

### Supabase

- Use typed client for all operations
- Follow Row Level Security patterns
- Document any database changes

## Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

## Questions?

Open an issue or contact @monmacllcapp.
