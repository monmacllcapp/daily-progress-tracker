import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Mail, Brain, Zap, ArrowRight, CheckCircle2 } from 'lucide-react';
import { isGoogleAuthAvailable, requestGoogleAuth, isGoogleConnected } from '../services/google-auth';
import { markOnboardingComplete } from '../utils/onboarding';

interface WelcomeOnboardingProps {
    onComplete: () => void;
}

const FEATURES = [
    {
        icon: Brain,
        title: 'AI-Powered Planning',
        description: 'Gemini AI categorizes tasks, suggests focus areas, and drafts email replies.',
    },
    {
        icon: Calendar,
        title: 'Calendar Integration',
        description: 'Sync with Google Calendar. Schedule tasks as time blocks with conflict detection.',
    },
    {
        icon: Mail,
        title: 'Smart Email Triage',
        description: '4-tier email classification: urgent, important, promotions, unsubscribe.',
    },
    {
        icon: Zap,
        title: 'Gamified Progress',
        description: 'Track streaks, celebrate milestones, and balance your life with the Wheel of Life.',
    },
];

export function WelcomeOnboarding({ onComplete }: WelcomeOnboardingProps) {
    const [step, setStep] = useState(0);
    const [googleConnected, setGoogleConnected] = useState(isGoogleConnected());
    const [connectingGoogle, setConnectingGoogle] = useState(false);

    const handleGoogleConnect = async () => {
        if (!isGoogleAuthAvailable()) {
            // Skip if not configured
            handleFinish();
            return;
        }
        setConnectingGoogle(true);
        try {
            await requestGoogleAuth();
            setGoogleConnected(true);
        } catch (err) {
            console.error('[Onboarding] Google auth failed:', err);
        } finally {
            setConnectingGoogle(false);
        }
    };

    const handleFinish = () => {
        markOnboardingComplete();
        onComplete();
    };

    const handleSkip = () => {
        markOnboardingComplete();
        onComplete();
    };

    return (
        <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
            <div className="max-w-lg w-full">
                <AnimatePresence mode="wait">
                    {step === 0 && (
                        <motion.div
                            key="welcome"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="text-center space-y-6"
                        >
                            <div className="space-y-2">
                                <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-400 to-rose-400 bg-clip-text text-transparent">
                                    Titan Life OS
                                </h1>
                                <p className="text-slate-400 text-lg">Your cognitive operating system</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-4">
                                {FEATURES.map((feature) => (
                                    <div
                                        key={feature.title}
                                        className="bg-white/5 border border-white/10 rounded-xl p-4 text-left"
                                    >
                                        <feature.icon className="w-6 h-6 text-blue-400 mb-2" />
                                        <h3 className="font-semibold text-sm mb-1">{feature.title}</h3>
                                        <p className="text-xs text-slate-500">{feature.description}</p>
                                    </div>
                                ))}
                            </div>

                            <div className="flex flex-col gap-3 pt-4">
                                <button
                                    onClick={() => setStep(1)}
                                    className="w-full py-3 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
                                >
                                    Get Started <ArrowRight className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={handleSkip}
                                    className="text-slate-500 text-sm hover:text-slate-400 transition-colors"
                                >
                                    Skip for now
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {step === 1 && (
                        <motion.div
                            key="connect"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="text-center space-y-6"
                        >
                            <div className="space-y-2">
                                <h2 className="text-3xl font-bold">Connect Google</h2>
                                <p className="text-slate-400">
                                    Link your Google account to sync Calendar and Gmail.
                                    {!isGoogleAuthAvailable() && (
                                        <span className="block text-xs text-slate-600 mt-1">
                                            (Google integration is not configured in this environment)
                                        </span>
                                    )}
                                </p>
                            </div>

                            <div className="space-y-3">
                                {googleConnected ? (
                                    <div className="flex items-center justify-center gap-2 py-3 text-emerald-400">
                                        <CheckCircle2 className="w-5 h-5" />
                                        <span className="font-medium">Google Connected</span>
                                    </div>
                                ) : (
                                    <button
                                        onClick={handleGoogleConnect}
                                        disabled={connectingGoogle || !isGoogleAuthAvailable()}
                                        className="w-full py-3 bg-white text-black rounded-xl font-bold transition-all hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {connectingGoogle ? (
                                            <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <>
                                                <svg className="w-5 h-5" viewBox="0 0 24 24">
                                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                                </svg>
                                                Sign in with Google
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>

                            <div className="flex flex-col gap-3 pt-2">
                                <button
                                    onClick={handleFinish}
                                    className="w-full py-3 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 rounded-xl font-bold transition-all"
                                >
                                    {googleConnected ? 'Continue to Dashboard' : 'Continue without Google'}
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
