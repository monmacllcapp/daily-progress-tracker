import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Plus, Pencil, Trash2, Check, X, GripVertical, ChevronDown, ChevronRight,
    Target, ArrowUp, ArrowDown
} from 'lucide-react';
import { createDatabase } from '../db';
import type { TitanDatabase } from '../db';
import type { Category, Task, Project, SubTask } from '../types/schema';
import { ICON_OPTIONS } from '../utils/icon-utils';
import { CategoryIcon } from './CategoryIcon';

const COLOR_PRESETS = [
    '#F59E0B', '#3B82F6', '#8B5CF6', '#6366F1', '#10B981',
    '#059669', '#EF4444', '#EC4899', '#F97316', '#14B8A6',
    '#06B6D4', '#8B5CF6', '#A855F7', '#D946EF', '#F43F5E',
    '#84CC16',
];

// --- Extracted sub-components (defined outside CategoryManager to avoid react-refresh issues) ---

interface FormFieldsProps {
    onSubmit: () => void;
    submitLabel: string;
    formName: string;
    setFormName: (v: string) => void;
    formColor: string;
    setFormColor: (v: string) => void;
    formIcon: string;
    setFormIcon: (v: string) => void;
    showColorPicker: boolean;
    setShowColorPicker: (v: boolean) => void;
    showIconPicker: boolean;
    setShowIconPicker: (v: boolean) => void;
    onCancel: () => void;
}

function ColorPicker({
    formColor,
    setFormColor,
    setShowColorPicker,
}: {
    formColor: string;
    setFormColor: (v: string) => void;
    setShowColorPicker: (v: boolean) => void;
}) {
    return (
        <div className="grid grid-cols-8 gap-1.5 p-2 bg-zinc-800/80 rounded-lg mt-1">
            {COLOR_PRESETS.map(color => (
                <button
                    key={color}
                    onClick={() => { setFormColor(color); setShowColorPicker(false); }}
                    className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                    style={{
                        backgroundColor: color,
                        borderColor: formColor === color ? 'white' : 'transparent',
                    }}
                />
            ))}
        </div>
    );
}

function IconPicker({
    formIcon,
    setFormIcon,
    setShowIconPicker,
}: {
    formIcon: string;
    setFormIcon: (v: string) => void;
    setShowIconPicker: (v: boolean) => void;
}) {
    return (
        <div className="grid grid-cols-8 gap-1.5 p-2 bg-zinc-800/80 rounded-lg mt-1">
            {ICON_OPTIONS.map(({ name, icon: Icon }) => (
                <button
                    key={name}
                    onClick={() => { setFormIcon(name); setShowIconPicker(false); }}
                    className={`w-7 h-7 rounded flex items-center justify-center transition-all hover:bg-zinc-700 ${
                        formIcon === name ? 'bg-zinc-600 ring-1 ring-white/50' : ''
                    }`}
                >
                    <Icon className="w-4 h-4" />
                </button>
            ))}
        </div>
    );
}

function FormFields({
    onSubmit,
    submitLabel,
    formName,
    setFormName,
    formColor,
    setFormColor,
    formIcon,
    setFormIcon,
    showColorPicker,
    setShowColorPicker,
    showIconPicker,
    setShowIconPicker,
    onCancel,
}: FormFieldsProps) {
    return (
        <div className="space-y-3">
            <input
                type="text"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="Category name..."
                className="w-full px-3 py-2 bg-zinc-800/60 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                onKeyDown={e => { if (e.key === 'Enter') onSubmit(); }}
                autoFocus
            />
            <div className="flex items-center gap-3">
                <button
                    onClick={() => { setShowColorPicker(!showColorPicker); setShowIconPicker(false); }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800/60 rounded-lg text-xs hover:bg-zinc-700/60"
                >
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: formColor }} />
                    Color
                </button>
                <button
                    onClick={() => { setShowIconPicker(!showIconPicker); setShowColorPicker(false); }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800/60 rounded-lg text-xs hover:bg-zinc-700/60"
                >
                    <CategoryIcon name={formIcon} className="w-4 h-4" />
                    Icon
                </button>
                <div className="flex-1" />
                <button
                    onClick={onSubmit}
                    disabled={!formName.trim()}
                    className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 rounded-lg text-xs font-medium"
                >
                    <Check className="w-3 h-3" /> {submitLabel}
                </button>
                <button
                    onClick={onCancel}
                    className="flex items-center gap-1 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-xs"
                >
                    <X className="w-3 h-3" /> Cancel
                </button>
            </div>
            {showColorPicker && (
                <ColorPicker
                    formColor={formColor}
                    setFormColor={setFormColor}
                    setShowColorPicker={setShowColorPicker}
                />
            )}
            {showIconPicker && (
                <IconPicker
                    formIcon={formIcon}
                    setFormIcon={setFormIcon}
                    setShowIconPicker={setShowIconPicker}
                />
            )}
        </div>
    );
}

// --- Main component ---

export function CategoryManager() {
    const [db, setDb] = useState<TitanDatabase | null>(null);
    const [categories, setCategories] = useState<Category[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [subtasks, setSubtasks] = useState<SubTask[]>([]);

    // UI state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    // Form state
    const [formName, setFormName] = useState('');
    const [formColor, setFormColor] = useState(COLOR_PRESETS[0]);
    const [formIcon, setFormIcon] = useState('star');
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [showIconPicker, setShowIconPicker] = useState(false);

    // Milestone creation
    const [newMilestoneName, setNewMilestoneName] = useState('');
    const [creatingMilestoneForProject, setCreatingMilestoneForProject] = useState<string | null>(null);

    useEffect(() => {
        const init = async () => {
            const database = await createDatabase();
            setDb(database);

            database.categories.find({ sort: [{ sort_order: 'asc' }] }).$.subscribe(docs => {
                setCategories(docs.map(d => d.toJSON() as Category));
            });
            database.tasks.find().$.subscribe(docs => {
                setTasks(docs.map(d => d.toJSON() as Task));
            });
            database.projects.find().$.subscribe(docs => {
                setProjects(docs.map(d => d.toJSON() as Project));
            });
            database.sub_tasks.find().$.subscribe(docs => {
                setSubtasks(docs.map(d => d.toJSON() as SubTask));
            });
        };
        init();
    }, []);

    const handleCreate = async () => {
        if (!db || !formName.trim()) return;
        const now = new Date().toISOString();
        await db.categories.insert({
            id: crypto.randomUUID(),
            name: formName.trim(),
            color_theme: formColor,
            icon: formIcon,
            current_progress: 0,
            streak_count: 0,
            sort_order: categories.length,
            created_at: now,
            updated_at: now,
        });
        setFormName('');
        setFormColor(COLOR_PRESETS[0]);
        setFormIcon('star');
        setShowCreate(false);
    };

    const handleEdit = async (categoryId: string) => {
        if (!db || !formName.trim()) return;
        const doc = await db.categories.findOne(categoryId).exec();
        if (!doc) return;
        await doc.patch({
            name: formName.trim(),
            color_theme: formColor,
            icon: formIcon,
            updated_at: new Date().toISOString(),
        });
        setEditingId(null);
    };

    const handleDelete = async (categoryId: string) => {
        if (!db) return;
        const doc = await db.categories.findOne(categoryId).exec();
        if (!doc) return;
        await doc.remove();
        setDeleteConfirmId(null);
        if (expandedId === categoryId) setExpandedId(null);
    };

    const handleReorder = async (categoryId: string, direction: 'up' | 'down') => {
        if (!db) return;
        const idx = categories.findIndex(c => c.id === categoryId);
        if (idx < 0) return;
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= categories.length) return;

        const current = await db.categories.findOne(categories[idx].id).exec();
        const swap = await db.categories.findOne(categories[swapIdx].id).exec();
        if (!current || !swap) return;

        await current.patch({ sort_order: swapIdx, updated_at: new Date().toISOString() });
        await swap.patch({ sort_order: idx, updated_at: new Date().toISOString() });
    };

    const startEdit = (cat: Category) => {
        setEditingId(cat.id);
        setFormName(cat.name);
        setFormColor(cat.color_theme);
        setFormIcon(cat.icon || 'star');
        setShowColorPicker(false);
        setShowIconPicker(false);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setFormName('');
        setFormColor(COLOR_PRESETS[0]);
        setFormIcon('star');
    };

    const handleCancel = () => {
        setShowCreate(false);
        cancelEdit();
    };

    const handleCreateMilestone = async (projectId: string) => {
        if (!db || !newMilestoneName.trim()) return;
        const projectSubtasks = subtasks.filter(st => st.project_id === projectId);
        await db.sub_tasks.insert({
            id: crypto.randomUUID(),
            project_id: projectId,
            title: newMilestoneName.trim(),
            time_estimate_minutes: 30,
            time_actual_minutes: 0,
            is_completed: false,
            sort_order: projectSubtasks.length,
            updated_at: new Date().toISOString(),
        });
        setNewMilestoneName('');
        setCreatingMilestoneForProject(null);
    };

    const getCategoryStats = (categoryId: string) => {
        const catTasks = tasks.filter(t => t.category_id === categoryId);
        const catProjects = projects.filter(p => p.category_id === categoryId);
        const activeTasks = catTasks.filter(t => t.status === 'active').length;
        const completedTasks = catTasks.filter(t => t.status === 'completed').length;
        const catSubtasks = subtasks.filter(st =>
            catProjects.some(p => p.id === st.project_id)
        );
        const completedMilestones = catSubtasks.filter(st => st.is_completed).length;
        return { activeTasks, completedTasks, projectCount: catProjects.length, milestoneCount: catSubtasks.length, completedMilestones };
    };

    const formFieldsProps = {
        formName,
        setFormName,
        formColor,
        setFormColor,
        formIcon,
        setFormIcon,
        showColorPicker,
        setShowColorPicker,
        showIconPicker,
        setShowIconPicker,
        onCancel: handleCancel,
    };

    return (
        <div className="h-full w-full flex flex-col p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">Life Categories</h3>
                {!showCreate && !editingId && (
                    <button
                        onClick={() => {
                            setShowCreate(true);
                            setFormName('');
                            setFormColor(COLOR_PRESETS[Math.floor(Math.random() * COLOR_PRESETS.length)]);
                            setFormIcon('star');
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs font-medium"
                    >
                        <Plus className="w-3 h-3" /> Add Category
                    </button>
                )}
            </div>

            {/* Create Form */}
            <AnimatePresence>
                {showCreate && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mb-4 p-3 bg-zinc-800/40 rounded-xl border border-zinc-700/50"
                    >
                        <p className="text-xs text-secondary mb-2 font-medium">New Category</p>
                        <FormFields
                            onSubmit={handleCreate}
                            submitLabel="Create"
                            {...formFieldsProps}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Category List */}
            {categories.length === 0 && !showCreate ? (
                <div className="text-center py-8 text-secondary text-sm">
                    <p>No categories yet.</p>
                    <p className="mt-1">Create your first life category to get started.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {categories.map((cat, idx) => {
                        const stats = getCategoryStats(cat.id);
                        const isEditing = editingId === cat.id;
                        const isExpanded = expandedId === cat.id;
                        const catProjects = projects.filter(p => p.category_id === cat.id);

                        return (
                            <motion.div
                                key={cat.id}
                                layout
                                className="bg-zinc-800/30 rounded-xl border border-zinc-700/30 overflow-hidden"
                            >
                                {isEditing ? (
                                    <div className="p-3">
                                        <FormFields
                                            onSubmit={() => handleEdit(cat.id)}
                                            submitLabel="Save"
                                            {...formFieldsProps}
                                        />
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center gap-2 p-3 group">
                                            <GripVertical className="w-4 h-4 text-zinc-600 flex-shrink-0" />

                                            {/* Color dot + icon */}
                                            <div
                                                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                                                style={{ backgroundColor: cat.color_theme + '20' }}
                                            >
                                                {cat.icon ? (
                                                    <CategoryIcon name={cat.icon} className="w-4 h-4" style={{ color: cat.color_theme }} />
                                                ) : (
                                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color_theme }} />
                                                )}
                                            </div>

                                            {/* Name + stats */}
                                            <button
                                                onClick={() => setExpandedId(isExpanded ? null : cat.id)}
                                                className="flex-1 text-left min-w-0"
                                            >
                                                <p className="text-sm font-medium truncate">{cat.name}</p>
                                                <p className="text-xs text-secondary">
                                                    {stats.activeTasks} active · {stats.completedTasks} done · {cat.streak_count > 0 ? `${cat.streak_count}d streak` : 'no streak'}
                                                </p>
                                            </button>

                                            {/* Expand chevron */}
                                            <button onClick={() => setExpandedId(isExpanded ? null : cat.id)}>
                                                {isExpanded ? <ChevronDown className="w-4 h-4 text-secondary" /> : <ChevronRight className="w-4 h-4 text-secondary" />}
                                            </button>

                                            {/* Actions */}
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => handleReorder(cat.id, 'up')}
                                                    disabled={idx === 0}
                                                    className="p-1 hover:bg-zinc-700 rounded disabled:opacity-20"
                                                >
                                                    <ArrowUp className="w-3 h-3" />
                                                </button>
                                                <button
                                                    onClick={() => handleReorder(cat.id, 'down')}
                                                    disabled={idx === categories.length - 1}
                                                    className="p-1 hover:bg-zinc-700 rounded disabled:opacity-20"
                                                >
                                                    <ArrowDown className="w-3 h-3" />
                                                </button>
                                                <button onClick={() => startEdit(cat)} className="p-1 hover:bg-zinc-700 rounded">
                                                    <Pencil className="w-3 h-3 text-blue-400" />
                                                </button>
                                                <button onClick={() => setDeleteConfirmId(cat.id)} className="p-1 hover:bg-zinc-700 rounded">
                                                    <Trash2 className="w-3 h-3 text-red-400" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Delete confirmation */}
                                        <AnimatePresence>
                                            {deleteConfirmId === cat.id && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: 'auto' }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    className="px-3 pb-3"
                                                >
                                                    <div className="flex items-center gap-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                                                        <p className="text-xs text-red-400 flex-1">Delete "{cat.name}"? Tasks won't be deleted.</p>
                                                        <button
                                                            onClick={() => handleDelete(cat.id)}
                                                            className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs font-medium"
                                                        >
                                                            Delete
                                                        </button>
                                                        <button
                                                            onClick={() => setDeleteConfirmId(null)}
                                                            className="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-xs"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>

                                        {/* Expanded: Category detail with projects + milestones */}
                                        <AnimatePresence>
                                            {isExpanded && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: 'auto' }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    className="px-3 pb-3 border-t border-zinc-700/30"
                                                >
                                                    {/* Progress bar */}
                                                    <div className="mt-3 mb-2">
                                                        <div className="flex justify-between text-xs mb-1">
                                                            <span className="text-secondary">Progress</span>
                                                            <span style={{ color: cat.color_theme }}>{Math.round(cat.current_progress * 100)}%</span>
                                                        </div>
                                                        <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                                                            <motion.div
                                                                initial={{ width: 0 }}
                                                                animate={{ width: `${cat.current_progress * 100}%` }}
                                                                className="h-full rounded-full"
                                                                style={{ backgroundColor: cat.color_theme }}
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Projects + milestones */}
                                                    {catProjects.length === 0 ? (
                                                        <p className="text-xs text-secondary mt-2">No projects linked to this category yet.</p>
                                                    ) : (
                                                        catProjects.map(project => {
                                                            const projectMilestones = subtasks.filter(st => st.project_id === project.id)
                                                                .sort((a, b) => a.sort_order - b.sort_order);
                                                            const completed = projectMilestones.filter(m => m.is_completed).length;

                                                            return (
                                                                <div key={project.id} className="mt-3">
                                                                    <div className="flex items-center gap-2">
                                                                        <Target className="w-3 h-3 text-secondary" />
                                                                        <p className="text-xs font-medium flex-1">{project.title}</p>
                                                                        <span className="text-xs text-secondary">
                                                                            {completed}/{projectMilestones.length}
                                                                        </span>
                                                                    </div>

                                                                    {/* Milestones list */}
                                                                    <div className="ml-5 mt-1 space-y-0.5">
                                                                        {projectMilestones.map(milestone => (
                                                                            <div key={milestone.id} className="flex items-center gap-2">
                                                                                <div className={`w-2 h-2 rounded-full ${milestone.is_completed ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
                                                                                <span className={`text-xs ${milestone.is_completed ? 'text-secondary line-through' : ''}`}>
                                                                                    {milestone.title}
                                                                                </span>
                                                                            </div>
                                                                        ))}

                                                                        {/* Add milestone */}
                                                                        {creatingMilestoneForProject === project.id ? (
                                                                            <div className="flex items-center gap-1 mt-1">
                                                                                <input
                                                                                    type="text"
                                                                                    value={newMilestoneName}
                                                                                    onChange={e => setNewMilestoneName(e.target.value)}
                                                                                    placeholder="Milestone name..."
                                                                                    className="flex-1 px-2 py-1 bg-zinc-800/60 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                                                    onKeyDown={e => { if (e.key === 'Enter') handleCreateMilestone(project.id); }}
                                                                                    autoFocus
                                                                                />
                                                                                <button
                                                                                    onClick={() => handleCreateMilestone(project.id)}
                                                                                    disabled={!newMilestoneName.trim()}
                                                                                    className="p-1 hover:bg-emerald-600 rounded disabled:opacity-40"
                                                                                >
                                                                                    <Check className="w-3 h-3 text-emerald-400" />
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => { setCreatingMilestoneForProject(null); setNewMilestoneName(''); }}
                                                                                    className="p-1 hover:bg-zinc-600 rounded"
                                                                                >
                                                                                    <X className="w-3 h-3" />
                                                                                </button>
                                                                            </div>
                                                                        ) : (
                                                                            <button
                                                                                onClick={() => setCreatingMilestoneForProject(project.id)}
                                                                                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-1"
                                                                            >
                                                                                <Plus className="w-3 h-3" /> Add milestone
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })
                                                    )}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </>
                                )}
                            </motion.div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
