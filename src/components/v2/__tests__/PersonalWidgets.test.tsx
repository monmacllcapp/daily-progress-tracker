import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { FamilyHub } from '../FamilyHub';
import { HealthTracker } from '../HealthTracker';
import { DocumentIntel } from '../DocumentIntel';
import { KnowledgeBase } from '../KnowledgeBase';
import { WeeklyDigest } from '../WeeklyDigest';
import type { FamilyEvent, Signal, ProductivityPattern } from '../../../types/signals';

// Test helpers
const makeFamilyEvent = (overrides: Partial<FamilyEvent> = {}): FamilyEvent => ({
  id: 'evt-1',
  member: 'John',
  summary: 'Soccer practice',
  start_time: '2026-02-13T15:00:00Z',
  end_time: '2026-02-13T16:00:00Z',
  source_calendar: 'family-cal-1',
  created_at: '2026-02-13T10:00:00Z',
  ...overrides,
});

const makeSignal = (overrides: Partial<Signal> = {}): Signal => ({
  id: 'sig-1',
  type: 'family_awareness',
  severity: 'info',
  domain: 'family',
  source: 'test-source',
  title: 'Test signal',
  context: 'Test context',
  auto_actionable: false,
  is_dismissed: false,
  is_acted_on: false,
  related_entity_ids: [],
  created_at: '2026-02-13T10:00:00Z',
  ...overrides,
});

const makePattern = (overrides: Partial<ProductivityPattern> = {}): ProductivityPattern => ({
  id: 'pat-1',
  pattern_type: 'peak_hours',
  description: 'Most productive in mornings',
  data: {},
  confidence: 0.85,
  week_start: '2026-02-10',
  created_at: '2026-02-13T10:00:00Z',
  ...overrides,
});

// FamilyHub tests
describe('FamilyHub', () => {
  it('shows loading state', () => {
    render(<FamilyHub isLoading={true} />);
    expect(screen.getByText('Loading family data...')).toBeInTheDocument();
  });

  it('shows empty state when no events', () => {
    render(<FamilyHub events={[]} signals={[]} />);
    expect(screen.getByText('No family events today')).toBeInTheDocument();
  });

  it('renders family events', () => {
    const events = [
      makeFamilyEvent({ id: 'evt-1', member: 'Alice', summary: 'Dance class' }),
      makeFamilyEvent({ id: 'evt-2', member: 'Bob', summary: 'Piano lesson' }),
    ];
    render(<FamilyHub events={events} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Dance class')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Piano lesson')).toBeInTheDocument();
  });

  it('shows family signals', () => {
    const signals = [
      makeSignal({ id: 'sig-1', domain: 'family', title: 'School event tomorrow' }),
    ];
    render(<FamilyHub signals={signals} />);
    expect(screen.getByText('School event tomorrow')).toBeInTheDocument();
  });
});

// HealthTracker tests
describe('HealthTracker', () => {
  it('shows loading state', () => {
    render(<HealthTracker isLoading={true} />);
    expect(screen.getByText('Loading health data...')).toBeInTheDocument();
  });

  it('shows empty state when no health data', () => {
    render(<HealthTracker signals={[]} streakDays={0} todayHabits={[]} />);
    expect(screen.getByText('No health data today')).toBeInTheDocument();
  });

  it('shows streak display', () => {
    render(<HealthTracker streakDays={7} />);
    expect(screen.getByText('7 days streak')).toBeInTheDocument();
  });

  it('shows today habits checklist', () => {
    const habits = [
      { name: 'Hydration', completed: true },
      { name: 'Exercise', completed: false },
    ];
    render(<HealthTracker todayHabits={habits} />);
    expect(screen.getByText('Hydration')).toBeInTheDocument();
    expect(screen.getByText('Exercise')).toBeInTheDocument();
  });

  it('shows health signals', () => {
    const signals = [
      makeSignal({ id: 'sig-1', domain: 'health_fitness', title: 'Workout reminder' }),
    ];
    render(<HealthTracker signals={signals} />);
    expect(screen.getByText('Workout reminder')).toBeInTheDocument();
  });
});

// DocumentIntel tests
describe('DocumentIntel', () => {
  it('shows loading state', () => {
    render(<DocumentIntel isLoading={true} />);
    expect(screen.getByText('Loading documents...')).toBeInTheDocument();
  });

  it('shows empty state when no documents', () => {
    render(<DocumentIntel documents={[]} />);
    expect(screen.getByText('No documents analyzed')).toBeInTheDocument();
  });

  it('renders documents list', () => {
    const documents = [
      {
        id: 'doc-1',
        title: 'Q4 Report',
        summary: 'Financial overview for Q4',
        extractedAt: '2026-02-13T10:00:00Z',
      },
      {
        id: 'doc-2',
        title: 'Contract Draft',
        summary: 'Updated terms and conditions',
        extractedAt: '2026-02-12T14:00:00Z',
      },
    ];
    render(<DocumentIntel documents={documents} />);
    expect(screen.getByText('Q4 Report')).toBeInTheDocument();
    expect(screen.getByText('Financial overview for Q4')).toBeInTheDocument();
    expect(screen.getByText('Contract Draft')).toBeInTheDocument();
    expect(screen.getByText('Updated terms and conditions')).toBeInTheDocument();
  });
});

// KnowledgeBase tests
describe('KnowledgeBase', () => {
  it('shows loading state', () => {
    render(<KnowledgeBase isLoading={true} />);
    expect(screen.getByText('Loading knowledge base...')).toBeInTheDocument();
  });

  it('shows empty state when no pages', () => {
    render(<KnowledgeBase pages={[]} />);
    expect(screen.getByText('No knowledge base entries')).toBeInTheDocument();
  });

  it('renders pages list', () => {
    const pages = [
      {
        id: 'page-1',
        title: 'Project Architecture',
        updatedAt: '2026-02-13T10:00:00Z',
        preview: 'System design overview',
      },
      {
        id: 'page-2',
        title: 'API Documentation',
        updatedAt: '2026-02-12T14:00:00Z',
        preview: 'REST API reference',
      },
    ];
    render(<KnowledgeBase pages={pages} />);
    expect(screen.getByText('Project Architecture')).toBeInTheDocument();
    expect(screen.getByText('System design overview')).toBeInTheDocument();
    expect(screen.getByText('API Documentation')).toBeInTheDocument();
    expect(screen.getByText('REST API reference')).toBeInTheDocument();
  });

  it('filters pages by search query', () => {
    const pages = [
      {
        id: 'page-1',
        title: 'React Components',
        updatedAt: '2026-02-13T10:00:00Z',
        preview: 'Component library',
      },
      {
        id: 'page-2',
        title: 'Python Scripts',
        updatedAt: '2026-02-12T14:00:00Z',
        preview: 'Automation scripts',
      },
    ];
    render(<KnowledgeBase pages={pages} />);

    const searchInput = screen.getByPlaceholderText('Search pages...');
    fireEvent.change(searchInput, { target: { value: 'react' } });

    expect(screen.getByText('React Components')).toBeInTheDocument();
    expect(screen.queryByText('Python Scripts')).not.toBeInTheDocument();
  });
});

// WeeklyDigest tests
describe('WeeklyDigest', () => {
  it('shows loading state', () => {
    render(<WeeklyDigest isLoading={true} />);
    expect(screen.getByText('Loading weekly digest...')).toBeInTheDocument();
  });

  it('shows empty state when no data', () => {
    render(<WeeklyDigest patterns={[]} tasksCompleted={0} signalsGenerated={0} streaksActive={0} />);
    expect(screen.getByText('No weekly data available')).toBeInTheDocument();
  });

  it('renders summary stats', () => {
    render(
      <WeeklyDigest
        tasksCompleted={42}
        signalsGenerated={15}
        streaksActive={3}
        weekStart="2026-02-10"
      />
    );
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders patterns with confidence', () => {
    const patterns = [
      makePattern({ id: 'pat-1', description: 'Peak productivity 9-11 AM', confidence: 0.85 }),
      makePattern({ id: 'pat-2', description: 'Best days: Tue, Thu', confidence: 0.92 }),
    ];
    render(<WeeklyDigest patterns={patterns} />);
    expect(screen.getByText('Peak productivity 9-11 AM')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByText('Best days: Tue, Thu')).toBeInTheDocument();
    expect(screen.getByText('92%')).toBeInTheDocument();
  });

  it('handles missing data gracefully', () => {
    render(
      <WeeklyDigest
        tasksCompleted={10}
        patterns={[]}
      />
    );
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.queryByText('Insights')).not.toBeInTheDocument();
  });
});
