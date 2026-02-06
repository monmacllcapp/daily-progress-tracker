/**
 * JarvisChat — Right-Panel AI Assistant
 *
 * Slides in from right, full height minus topbar. Uses processJarvisMessage
 * for full-context AI responses. Reads isOpen from jarvisStore.
 * Portal to document.body to escape WidgetWrapper backdrop-filter constraints.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Bot,
    X,
    Send,
    Mic,
    MicOff,
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
    type JarvisMessage,
    type CalendarIntent,
    type JarvisIntent,
} from '../services/jarvis';
import { useJarvisStore } from '../store/jarvisStore';
import { SoundwaveAnimation } from './SoundwaveAnimation';

// --- Speech Recognition (feature-detected) ---

function getSpeechRecognition(): (new () => SpeechRecognition) | null {
    if (typeof window === 'undefined') return null;
    return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

// --- Text-to-Speech ---

// Preload voices (Chrome loads them async)
if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
    };
}

function pickBestVoice(): SpeechSynthesisVoice | null {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) return null;

    const enVoices = voices.filter((v) => v.lang.startsWith('en'));
    if (enVoices.length === 0) return null;

    // Priority tiers for natural-sounding voices (macOS/Chrome)
    const tiers = [
        // Tier 1: Premium/Enhanced system voices (macOS)
        (v: SpeechSynthesisVoice) =>
            /\(Premium\)|\(Enhanced\)/i.test(v.name),
        // Tier 2: Siri voices (very natural on macOS)
        (v: SpeechSynthesisVoice) => /Siri/i.test(v.name),
        // Tier 3: Google HD voices (Chrome)
        (v: SpeechSynthesisVoice) =>
            v.name.includes('Google') && v.name.includes('UK'),
        // Tier 4: Specific high-quality names
        (v: SpeechSynthesisVoice) =>
            /\b(Daniel|Samantha|Alex|Karen|Moira)\b/.test(v.name),
        // Tier 5: Any Google voice
        (v: SpeechSynthesisVoice) => v.name.includes('Google'),
    ];

    for (const test of tiers) {
        const match = enVoices.find(test);
        if (match) return match;
    }

    return enVoices[0];
}

function speakText(text: string, onEnd?: () => void): void {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    const voice = pickBestVoice();
    if (voice) utterance.voice = voice;
    if (onEnd) utterance.onend = onEnd;
    window.speechSynthesis.speak(utterance);
}

function stopSpeaking(): void {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
}

// --- Component ---

export function JarvisChat() {
    const { isOpen, setIsOpen, voiceEnabled, toggleVoice: toggleVoiceOutput } = useJarvisStore();
    const [messages, setMessages] = useState<JarvisMessage[]>([]);
    const [input, setInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [pendingIntent, setPendingIntent] = useState<CalendarIntent | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const recognitionRef = useRef<SpeechRecognition | null>(null);

    // Refs to break effect dependency cycles
    const hasBriefedRef = useRef(false);
    const lastSpokenIdRef = useRef<string | null>(null);
    const messagesRef = useRef<JarvisMessage[]>([]);
    const isListeningRef = useRef(false);
    const isOpenRef = useRef(false);
    // Track whether user initiated voice — only auto-restart mic in voice-initiated conversations
    const userInitiatedVoiceRef = useRef(false);
    // Cooldown: prevent rapid consecutive Maple responses
    const lastJarvisResponseTimeRef = useRef(0);

    // Keep refs in sync
    messagesRef.current = messages;
    isListeningRef.current = isListening;
    isOpenRef.current = isOpen;

    const hasSpeech = !!getSpeechRecognition();

    // --- Callbacks ---

    const addMessage = useCallback(
        (role: 'user' | 'jarvis', text: string, intent?: CalendarIntent, jarvisIntent?: JarvisIntent) => {
            const msg: JarvisMessage = {
                id: crypto.randomUUID(),
                role,
                text,
                intent,
                jarvisIntent,
                timestamp: new Date(),
            };
            setMessages((prev) => [...prev, msg]);
            return msg;
        },
        []
    );

    // Minimum gap between Maple responses to prevent rapid-fire loops (ms)
    const RESPONSE_COOLDOWN_MS = 2000;

    // Start speech recognition (reads refs, no dependency issues)
    const startListening = useCallback(() => {
        if (isListeningRef.current) return;
        const SpeechRecognitionClass = getSpeechRecognition();
        if (!SpeechRecognitionClass) return;

        const recognition = new SpeechRecognitionClass();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            const transcript = event.results[0]?.[0]?.transcript?.trim();
            const confidence = event.results[0]?.[0]?.confidence ?? 0;

            // Filter out low-confidence transcriptions (echo/noise)
            if (!transcript || confidence < 0.6) {
                console.log('[Maple] Ignoring low-confidence speech:', transcript, confidence);
                return;
            }

            // Enforce cooldown between responses
            const now = Date.now();
            if (now - lastJarvisResponseTimeRef.current < RESPONSE_COOLDOWN_MS) {
                console.log('[Maple] Cooldown active, ignoring input:', transcript);
                return;
            }

            setInput(transcript);
            setTimeout(() => {
                setInput('');
                addMessage('user', transcript);
                setIsProcessing(true);
                processJarvisMessage(transcript, messagesRef.current)
                    .then((intent) => {
                        lastJarvisResponseTimeRef.current = Date.now();
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
                            return executeCalendarAction(calendarIntent).then((result) => {
                                addMessage('jarvis', result, calendarIntent, intent);
                            });
                        } else {
                            addMessage('jarvis', intent.response, undefined, intent);
                        }
                    })
                    .catch(() => {
                        addMessage('jarvis', 'Something went wrong. Please try again.');
                    })
                    .finally(() => {
                        setIsProcessing(false);
                    });
            }, 500);
        };

        recognition.onerror = () => {
            isListeningRef.current = false;
            setIsListening(false);
        };
        recognition.onend = () => {
            isListeningRef.current = false;
            setIsListening(false);
        };

        recognitionRef.current = recognition;
        recognition.start();
        isListeningRef.current = true;
        setIsListening(true);
    }, [addMessage]);

    const toggleVoice = useCallback(() => {
        if (isListeningRef.current) {
            recognitionRef.current?.stop();
            isListeningRef.current = false;
            setIsListening(false);
            userInitiatedVoiceRef.current = false;
            return;
        }
        userInitiatedVoiceRef.current = true;
        startListening();
    }, [startListening]);

    // --- Effects ---

    // Speak new Jarvis messages (only genuinely new ones via lastSpokenIdRef)
    // Only auto-restart mic when user initiated a voice conversation (not text input)
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        if (messages.length === 0) return;

        const last = messages[messages.length - 1];
        if (last.role === 'jarvis' && last.id !== lastSpokenIdRef.current) {
            lastSpokenIdRef.current = last.id;
            lastJarvisResponseTimeRef.current = Date.now();

            if (voiceEnabled) {
                speakText(last.text, () => {
                    // Only auto-restart mic if user was using voice input (not text)
                    // 800ms delay after TTS ends to avoid picking up echo/reverb
                    if (userInitiatedVoiceRef.current && isOpenRef.current && hasSpeech) {
                        setTimeout(() => startListening(), 800);
                    }
                });
            }
            // Removed: no longer auto-start mic when voice output is off.
            // User must explicitly click the mic button to start voice input.
        }
    }, [messages, voiceEnabled, hasSpeech, startListening]);

    // Cancel speech + mic when chat closes, reset voice tracking
    useEffect(() => {
        if (!isOpen) {
            stopSpeaking();
            recognitionRef.current?.stop();
            isListeningRef.current = false;
            setIsListening(false);
            userInitiatedVoiceRef.current = false;
        }
    }, [isOpen]);

    // Generate briefing on first open (mic auto-start removed — user clicks mic to start voice)
    useEffect(() => {
        if (!isOpen) return;
        setTimeout(() => inputRef.current?.focus(), 100);

        if (!hasBriefedRef.current) {
            hasBriefedRef.current = true;
            setIsProcessing(true);
            generateBriefing()
                .then((text) => {
                    setMessages((prev) => [
                        ...prev,
                        {
                            id: crypto.randomUUID(),
                            role: 'jarvis',
                            text,
                            timestamp: new Date(),
                        },
                    ]);
                })
                .catch(() => {
                    setMessages((prev) => [
                        ...prev,
                        {
                            id: crypto.randomUUID(),
                            role: 'jarvis',
                            text: "Hey! I'm Maple, your AI assistant. What can I help you with?",
                            timestamp: new Date(),
                        },
                    ]);
                })
                .finally(() => setIsProcessing(false));
        }
        // No auto-start mic on re-open — user explicitly clicks mic button
    // Only re-run when isOpen changes — briefing is guarded by ref
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
            const intent = await processJarvisMessage(text, messagesRef.current);

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
                processJarvisMessage(suggestion, messagesRef.current)
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

    const available = isJarvisAvailable();

    const lastJarvisMessage = [...messages].reverse().find((m) => m.role === 'jarvis');
    const suggestions = lastJarvisMessage?.jarvisIntent?.suggestions ?? [];

    return createPortal(
        <>
            {/* Small trigger on non-dashboard pages */}
            <AnimatePresence>
                {!isOpen && (
                    <motion.button
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        onClick={() => setIsOpen(true)}
                        className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/25 flex items-center justify-center hover:shadow-cyan-500/40 transition-shadow"
                        title="Open Maple"
                    >
                        <Bot className="w-5 h-5" />
                    </motion.button>
                )}
            </AnimatePresence>

            {/* Right-panel slide */}
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
                                    <SoundwaveAnimation active={isProcessing} size="sm" />
                                    <div>
                                        <h3 className="text-sm font-semibold text-white">Maple</h3>
                                        <p className="text-[10px] text-slate-400">
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
                                        placeholder={available ? 'Ask Maple anything...' : 'Set VITE_GEMINI_API_KEY to start'}
                                        disabled={!available || isProcessing}
                                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 disabled:opacity-50 transition-colors"
                                    />
                                    {hasSpeech && (
                                        <button
                                            onClick={toggleVoice}
                                            disabled={!available || isProcessing}
                                            className={`p-2 rounded-xl transition-colors ${
                                                isListening
                                                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                                                    : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                                            } disabled:opacity-50`}
                                            title={isListening ? 'Stop listening' : 'Voice input'}
                                        >
                                            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                                        </button>
                                    )}
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
            </AnimatePresence>
        </>,
        document.body
    );
}
