import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Zap } from 'lucide-react';
import { createDatabase } from '../db';
import { createTask } from '../services/task-rollover';
import { categorizeTask, isAIAvailable } from '../services/ai-advisor';
import type { Category } from '../types/schema';

interface BrainDumpProps {
    onTasksCreated?: (count: number) => void;
}

export function BrainDump({ onTasksCreated }: BrainDumpProps) {
    const [input, setInput] = useState('');
    const [isExpanded, setIsExpanded] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const handleSubmit = async () => {
        const lines = input
            .split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 0);

        if (lines.length === 0) return;

        setIsSubmitting(true);
        try {
            const db = await createDatabase();
            const today = new Date().toISOString().split('T')[0];
            const existingTasks = await db.tasks.find({ selector: { status: 'active' } }).exec();
            let sortOrder = existingTasks.length;

            // Load categories for AI categorization
            let cats: Category[] = [];
            if (isAIAvailable()) {
                const catDocs = await db.categories.find().exec();
                cats = catDocs.map(d => d.toJSON() as Category);
            }

            for (const line of lines) {
                // Attempt AI categorization if available
                const categoryId = cats.length > 0
                    ? await categorizeTask(line, cats)
                    : undefined;

                await createTask(db, {
                    title: line,
                    priority: 'medium',
                    status: 'active',
                    source: 'brain_dump',
                    created_date: today,
                    sort_order: sortOrder++,
                    category_id: categoryId || '',
                });
            }

            setInput('');
            setIsExpanded(false);
            onTasksCreated?.(lines.length);
        } catch (err) {
            console.error('[BrainDump] Failed to create tasks:', err);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && e.metaKey) { e.preventDefault(); handleSubmit(); } }; return ( <div className="w-full"> <AnimatePresence mode="wait"> {!isExpanded ? ( <motion.button key="collapsed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setIsExpanded(true); setTimeout(() => inputRef.current?.focus(), 100); }} className="w-full flex items-center gap-3 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-slate-500 hover:text-white hover:bg-white/10 transition-all" > <Plus className="w-4 h-4" /> <span className="text-sm">Brain dump — type anything on your mind...</span> </motion.button> ) : ( <motion.div key="expanded" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="w-full" > <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} aria-label="Brain dump tasks" placeholder="Type one task per line...&#10;Buy groceries&#10;Call the accountant&#10;Review project proposal" rows={4} className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors resize-none text-sm" autoFocus /> <div className="flex items-center justify-between mt-2"> <span className="text-xs text-slate-600"> {input.split('\n').filter(l => l.trim()).length} task{input.split('\n').filter(l => l.trim()).length !== 1 ? 's' : ''}
                                {' · '}
                                <kbd className="px-1 py-0.5 bg-white/5 rounded text-[10px]">Cmd+Enter</kbd> to add
                            </span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => { setIsExpanded(false); setInput(''); }}
                                    className="px-3 py-1.5 text-xs text-slate-500 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSubmit}
                                    disabled={isSubmitting || input.trim().length === 0}
                                    className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 rounded-lg text-xs font-bold transition-all"
                                >
                                    <Zap className="w-3 h-3" />
                                    {isSubmitting ? 'Adding...' : 'Add Tasks'}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
