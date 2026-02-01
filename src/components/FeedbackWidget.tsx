import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquarePlus, X, Send, Bug, Lightbulb, MessageCircle } from 'lucide-react';

type FeedbackType = 'bug' | 'feature' | 'general';

interface FeedbackEntry {
    id: string;
    type: FeedbackType;
    message: string;
    page: string;
    timestamp: string;
    userAgent: string;
}

const FEEDBACK_KEY = 'titan_feedback_entries';

function saveFeedback(entry: FeedbackEntry) {
    const existing = JSON.parse(localStorage.getItem(FEEDBACK_KEY) || '[]') as FeedbackEntry[];
    existing.push(entry);
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify(existing));
}

const TYPE_OPTIONS: { value: FeedbackType; label: string; icon: typeof Bug; color: string }[] = [
    { value: 'bug', label: 'Bug', icon: Bug, color: 'text-red-400' },
    { value: 'feature', label: 'Feature', icon: Lightbulb, color: 'text-amber-400' },
    { value: 'general', label: 'General', icon: MessageCircle, color: 'text-blue-400' },
];

export function FeedbackWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [type, setType] = useState<FeedbackType>('general');
    const [message, setMessage] = useState('');
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = () => {
        if (!message.trim()) return;

        const entry: FeedbackEntry = {
            id: crypto.randomUUID(),
            type,
            message: message.trim(),
            page: window.location.pathname,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
        };

        saveFeedback(entry);
        setSubmitted(true);
        setTimeout(() => {
            setSubmitted(false);
            setMessage('');
            setType('general');
            setIsOpen(false);
        }, 1500);
    };

    return (
        <>
            {/* Floating button */}
            <button
                onClick={() => setIsOpen(true)}
                aria-label="Send feedback"
                className="fixed bottom-6 left-6 z-40 w-12 h-12 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 shadow-lg shadow-blue-500/20 flex items-center justify-center transition-all hover:scale-110"
            >
                <MessageSquarePlus className="w-5 h-5 text-white" />
            </button>

            {/* Modal */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                        onClick={(e) => {
                            if (e.target === e.currentTarget) setIsOpen(false);
                        }}
                    >
                        <motion.div
                            initial={{ y: 40, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 40, opacity: 0 }}
                            className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-2xl p-6 space-y-4"
                        >
                            {submitted ? (
                                <div className="text-center py-8">
                                    <div className="text-4xl mb-3">&#10003;</div>
                                    <p className="text-lg font-semibold text-emerald-400">Thanks for your feedback!</p>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-lg font-bold text-white">Send Feedback</h3>
                                        <button
                                            onClick={() => setIsOpen(false)}
                                            aria-label="Close feedback"
                                            className="text-slate-500 hover:text-slate-300 transition-colors"
                                        >
                                            <X className="w-5 h-5" />
                                        </button>
                                    </div>

                                    {/* Type selector */}
                                    <div className="flex gap-2">
                                        {TYPE_OPTIONS.map((opt) => (
                                            <button
                                                key={opt.value}
                                                onClick={() => setType(opt.value)}
                                                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border text-sm font-medium transition-all ${
                                                    type === opt.value
                                                        ? 'border-white/20 bg-white/10 text-white'
                                                        : 'border-white/5 bg-white/[0.02] text-slate-500 hover:text-slate-300'
                                                }`}
                                            >
                                                <opt.icon className={`w-4 h-4 ${type === opt.value ? opt.color : ''}`} />
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Message */}
                                    <textarea
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        placeholder={
                                            type === 'bug'
                                                ? 'Describe the bug — what happened and what you expected...'
                                                : type === 'feature'
                                                  ? 'What feature would make Titan better for you?'
                                                  : 'Share your thoughts...'
                                        }
                                        aria-label="Feedback message"
                                        rows={4}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 resize-none"
                                    />

                                    {/* Submit */}
                                    <button
                                        onClick={handleSubmit}
                                        disabled={!message.trim()}
                                        className="w-full py-3 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl font-bold transition-all flex items-center justify-center gap-2 text-white"
                                    >
                                        <Send className="w-4 h-4" />
                                        Submit Feedback
                                    </button>

                                    <p className="text-xs text-slate-600 text-center">
                                        Feedback is stored locally and helps us improve Titan.
                                    </p>
                                </>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
