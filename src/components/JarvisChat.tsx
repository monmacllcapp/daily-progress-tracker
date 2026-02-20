/**
 * JarvisChat — Right-Panel AI Text Chat
 *
 * Pure text chat panel. Voice features extracted to voice-mode.ts.
 * Messages stored in jarvisStore (shared with voice mode).
 * Portal to document.body to escape WidgetWrapper backdrop-filter.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Send,
  Loader2,
  Calendar,
  CheckCircle2,
  XCircle,
  Volume2,
  VolumeOff,
} from 'lucide-react';
import {
  executeCalendarAction,
  processJarvisMessage,
  generateBriefing,
  isJarvisAvailable,
  type CalendarIntent,
} from '../services/jarvis';
import { speakText, stopSpeaking } from '../services/speech-tts';
import { useJarvisStore } from '../store/jarvisStore';
import { SoundwaveAnimation } from './SoundwaveAnimation';

export function JarvisChat() {
  const {
    isOpen,
    setIsOpen,
    voiceEnabled,
    toggleVoice: toggleVoiceOutput,
    voiceMode,
    messages,
    addMessage,
  } = useJarvisStore();

  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingIntent, setPendingIntent] = useState<CalendarIntent | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasBriefedRef = useRef(false);
  const lastSpokenIdRef = useRef<string | null>(null);

  const available = isJarvisAvailable();

  // --- Speak new jarvis messages when voice is enabled ---
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (messages.length === 0) return;

    const last = messages[messages.length - 1];
    if (
      last.role === 'jarvis' &&
      last.id !== lastSpokenIdRef.current &&
      voiceEnabled &&
      // Only speak from panel if voice mode is idle (voice-mode.ts handles its own TTS)
      voiceMode === 'idle'
    ) {
      lastSpokenIdRef.current = last.id;
      speakText(last.text);
    }
  }, [messages, voiceEnabled, voiceMode]);

  // Cancel speech when panel closes
  useEffect(() => {
    if (!isOpen) {
      stopSpeaking();
    }
  }, [isOpen]);

  // Generate briefing on first open
  useEffect(() => {
    if (!isOpen) return;
    setTimeout(() => inputRef.current?.focus(), 100);

    if (!hasBriefedRef.current) {
      hasBriefedRef.current = true;
      setIsProcessing(true);
      generateBriefing()
        .then((text) => {
          addMessage('jarvis', text);
        })
        .catch(() => {
          addMessage('jarvis', "Hey! I'm Maple, your AI assistant. What can I help you with?");
        })
        .finally(() => setIsProcessing(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // --- Handlers ---

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isProcessing) return;

    setInput('');
    addMessage('user', text);
    setIsProcessing(true);

    try {
      const currentMessages = useJarvisStore.getState().messages;
      const intent = await processJarvisMessage(text, currentMessages);

      if (
        (intent.action === 'create' || intent.action === 'move' || intent.action === 'delete') &&
        !intent.needsConfirmation
      ) {
        const calendarIntent: CalendarIntent = {
          action: intent.action as CalendarIntent['action'],
          eventTitle: intent.eventTitle,
          startTime: intent.startTime,
          endTime: intent.endTime,
          duration: intent.duration,
          originalEventId: intent.originalEventId,
          conflicts: intent.conflicts,
          response: intent.response,
          needsConfirmation: intent.needsConfirmation,
        };
        const result = await executeCalendarAction(calendarIntent);
        addMessage('jarvis', result, calendarIntent, intent);
      } else if (intent.needsConfirmation) {
        const calendarIntent: CalendarIntent = {
          action: intent.action as CalendarIntent['action'],
          eventTitle: intent.eventTitle,
          startTime: intent.startTime,
          endTime: intent.endTime,
          duration: intent.duration,
          originalEventId: intent.originalEventId,
          conflicts: intent.conflicts,
          response: intent.response,
          needsConfirmation: true,
        };
        setPendingIntent(calendarIntent);
        addMessage('jarvis', intent.response, calendarIntent, intent);
      } else {
        addMessage('jarvis', intent.response, undefined, intent);
      }
    } catch {
      addMessage('jarvis', 'Something went wrong. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }, [input, isProcessing, addMessage]);

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      setInput(suggestion);
      setTimeout(() => {
        addMessage('user', suggestion);
        setIsProcessing(true);
        const currentMessages = useJarvisStore.getState().messages;
        processJarvisMessage(suggestion, currentMessages)
          .then((intent) => {
            addMessage('jarvis', intent.response, undefined, intent);
          })
          .catch(() => {
            addMessage('jarvis', 'Something went wrong. Please try again.');
          })
          .finally(() => {
            setIsProcessing(false);
            setInput('');
          });
      }, 100);
    },
    [addMessage]
  );

  const handleConfirm = useCallback(async () => {
    if (!pendingIntent) return;
    setIsProcessing(true);
    setPendingIntent(null);

    try {
      const result = await executeCalendarAction(pendingIntent);
      addMessage('jarvis', result);
    } catch {
      addMessage('jarvis', 'Failed to execute the action. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }, [pendingIntent, addMessage]);

  const handleCancel = useCallback(() => {
    setPendingIntent(null);
    addMessage('jarvis', "No problem, I've cancelled that action.");
  }, [addMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const lastJarvisMessage = [...messages].reverse().find((m) => m.role === 'jarvis');
  const suggestions = lastJarvisMessage?.jarvisIntent?.suggestions ?? [];

  // Voice mode badge text
  const voiceBadge =
    voiceMode === 'listening'
      ? 'Listening...'
      : voiceMode === 'processing'
        ? 'Thinking...'
        : voiceMode === 'speaking'
          ? 'Speaking...'
          : null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 z-40 bg-black/30"
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed top-16 right-0 bottom-0 z-50 w-[400px] max-w-[90vw] flex flex-col border-l border-white/10 bg-slate-900/95 backdrop-blur-xl shadow-2xl shadow-black/50"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-3">
                <SoundwaveAnimation active={isProcessing || voiceMode === 'processing'} size="sm" />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-white">Maple</h3>
                    {voiceBadge && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 font-medium">
                        {voiceBadge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    {available ? 'AI Assistant' : 'Not configured'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={toggleVoiceOutput}
                  className={`p-1.5 rounded-lg transition-colors ${
                    voiceEnabled
                      ? 'bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25'
                      : 'text-slate-500 hover:bg-white/10 hover:text-slate-300'
                  }`}
                  title={voiceEnabled ? 'Voice on — click to mute' : 'Voice off — click to unmute'}
                >
                  {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeOff className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-thin">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white rounded-br-md'
                        : 'bg-white/5 text-slate-200 border border-white/5 rounded-bl-md'
                    }`}
                  >
                    {msg.text}
                    {msg.intent?.conflicts && msg.intent.conflicts.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {msg.intent.conflicts.map((c, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 rounded-lg px-2 py-1"
                          >
                            <Calendar className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{c.summary}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {pendingIntent && !isProcessing && (
                <div className="flex justify-start">
                  <div className="flex gap-2">
                    <button
                      onClick={handleConfirm}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Confirm
                    </button>
                    <button
                      onClick={handleCancel}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-slate-300 text-xs font-medium transition-colors"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {suggestions.length > 0 && !isProcessing && !pendingIntent && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => handleSuggestionClick(s)}
                      className="px-3 py-1.5 rounded-full text-xs font-medium bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 hover:bg-cyan-500/20 hover:border-cyan-500/30 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {isProcessing && (
                <div className="flex justify-start">
                  <div className="bg-white/5 border border-white/5 rounded-2xl rounded-bl-md px-3.5 py-2">
                    <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input bar */}
            <div className="px-3 py-2.5 border-t border-white/10">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={available ? 'Ask Maple anything...' : 'Set VITE_OLLAMA_BASE_URL to start'}
                  disabled={!available || isProcessing}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 disabled:opacity-50 transition-colors"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || !available || isProcessing}
                  className="p-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-50 disabled:hover:bg-cyan-600 transition-colors"
                  title="Send message"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
