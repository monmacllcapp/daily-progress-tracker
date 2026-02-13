import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommandPalette } from '../CommandPalette';

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when isOpen is false', () => {
    render(<CommandPalette isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument();
  });

  it('renders when isOpen is true', () => {
    render(<CommandPalette isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('command-palette')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ask MAPLE anything...')).toBeInTheDocument();
  });

  it('close button calls onClose', async () => {
    const onClose = vi.fn();
    render(<CommandPalette isOpen={true} onClose={onClose} />);

    const closeButton = screen.getByRole('button', { name: 'Close' });
    await userEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('escape key calls onClose', async () => {
    const onClose = vi.fn();
    render(<CommandPalette isOpen={true} onClose={onClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('submitting query shows user message and calls onSubmit', async () => {
    const onSubmit = vi.fn().mockResolvedValue('AI response');
    render(<CommandPalette isOpen={true} onClose={vi.fn()} onSubmit={onSubmit} />);

    const input = screen.getByPlaceholderText('Ask MAPLE anything...');
    await userEvent.type(input, 'What are my tasks?');
    fireEvent.submit(input.closest('form')!);

    expect(screen.getByText('What are my tasks?')).toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledWith('What are my tasks?');

    await waitFor(() => {
      expect(screen.getByText('AI response')).toBeInTheDocument();
    });
  });

  it('shows loading state during submission', async () => {
    const onSubmit = vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(() => resolve('Done'), 100)));
    render(<CommandPalette isOpen={true} onClose={vi.fn()} onSubmit={onSubmit} />);

    const input = screen.getByPlaceholderText('Ask MAPLE anything...');
    await userEvent.type(input, 'Test query');
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Thinking...')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.queryByText('Thinking...')).not.toBeInTheDocument();
      expect(screen.getByText('Done')).toBeInTheDocument();
    });
  });
});
