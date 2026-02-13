import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Loader2, Send, Sparkles } from 'lucide-react';

interface CommandPaletteProps {
  isOpen?: boolean;
  onClose?: () => void;
  onSubmit?: (query: string) => Promise<string | null>;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen: controlledOpen,
  onClose: controlledClose,
  onSubmit
}) => {
  const [isOpen, setIsOpen] = useState(controlledOpen ?? false);
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sync with controlled prop
  useEffect(() => {
    if (controlledOpen !== undefined) setIsOpen(controlledOpen);
  }, [controlledOpen]);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    controlledClose?.();
  }, [controlledClose]);

  // Keyboard shortcut: Cmd/Ctrl+K to toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) {
          close();
        } else {
          setIsOpen(true);
        }
      }
      if (e.key === 'Escape' && isOpen) {
        close();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, close]);

  // Focus input when opening
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current && typeof messagesEndRef.current.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isLoading) return;

    const userMessage = query.trim();
    setQuery('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      let response: string | null = null;
      if (onSubmit) {
        response = await onSubmit(userMessage);
      }
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: response || 'I couldn\'t process that request. Please try again.'
      }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'An error occurred. Please try again.'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]" data-testid="command-palette">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />

      {/* Palette */}
      <div className="relative w-full max-w-xl mx-4 bg-slate-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <span className="text-sm text-slate-400">MAPLE AI</span>
          <div className="flex-1" />
          <kbd className="text-xs text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded">ESC</kbd>
          <button onClick={close} className="p-1 hover:bg-white/10 rounded" aria-label="Close">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Messages */}
        {messages.length > 0 && (
          <div className="max-h-64 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`text-sm ${msg.role === 'user' ? 'text-white' : 'text-slate-300'}`}>
                <span className={`text-xs font-medium ${msg.role === 'user' ? 'text-indigo-400' : 'text-emerald-400'}`}>
                  {msg.role === 'user' ? 'You' : 'MAPLE'}
                </span>
                <p className="mt-0.5">{msg.content}</p>
              </div>
            ))}
            {isLoading && (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                Thinking...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Input */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2 px-4 py-3 border-t border-white/5">
          <Search className="w-4 h-4 text-slate-500 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask MAPLE anything..."
            className="flex-1 bg-transparent text-white text-sm placeholder-slate-500 outline-none"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!query.trim() || isLoading}
            className="p-1 hover:bg-white/10 rounded disabled:opacity-30 transition-opacity"
          >
            <Send className="w-4 h-4 text-indigo-400" />
          </button>
        </form>
      </div>
    </div>
  );
};
