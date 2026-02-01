import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Target, Upload, X, Edit2 } from 'lucide-react';
import { createDatabase } from '../db';
import type { VisionBoard } from '../types/schema';
import { v4 as uuidv4 } from 'uuid';

const CATEGORY_COLORS = [
    '#F59E0B', '#3B82F6', '#8B5CF6', '#6366F1',
    '#10B981', '#059669', '#1E40AF', '#EF4444'
];

function getRandomColor(): string {
    return CATEGORY_COLORS[Math.floor(Math.random() * CATEGORY_COLORS.length)];
}

export function VisionBoardGallery() {
    const [visions, setVisions] = useState<VisionBoard[]>([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newDeclaration, setNewDeclaration] = useState('');
    const [newPurpose, setNewPurpose] = useState('');
    const [newCategory, setNewCategory] = useState('');
    const [imagePreview, setImagePreview] = useState<string>('');
    const [editingCategory, setEditingCategory] = useState<{ visionId: string; name: string } | null>(null);

    useEffect(() => {
        const loadVisions = async () => {
            const db = await createDatabase();
            db.vision_board.find().$.subscribe(docs => {
                setVisions(docs.map(d => d.toJSON()));
            });
        };
        loadVisions();
    }, []);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const createOrUpdateCategory = async (categoryName: string) => {
        if (!categoryName.trim()) return null;

        try {
            const db = await createDatabase();

            // Check if category already exists
            const existing = await db.categories.findOne({
                selector: { name: categoryName.trim() }
            }).exec();

            if (existing) {
                return existing.id;
            }

            // Create new category
            const categoryId = uuidv4();
            await db.categories.insert({
                id: categoryId,
                user_id: 'default-user',
                name: categoryName.trim(),
                color_theme: getRandomColor(),
                current_progress: 0,
                streak_count: 0,
                sort_order: 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });

            return categoryId;
        } catch (err) {
            console.error('Failed to create category:', err);
            return null;
        }
    };

    const createVision = async () => {
        if (!newDeclaration.trim() || !newCategory.trim()) return;

        try {
            const categoryId = await createOrUpdateCategory(newCategory);

            const db = await createDatabase();
            await db.vision_board.insert({
                id: uuidv4(),
                user_id: 'default-user',
                declaration: newDeclaration,
                rpm_purpose: newPurpose,
                pain_payload: '',
                pleasure_payload: '',
                visual_anchor: imagePreview,
                category_name: newCategory.trim(),
                category_id: categoryId || undefined,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });

            setNewDeclaration('');
            setNewPurpose('');
            setNewCategory('');
            setImagePreview('');
            setShowCreateModal(false);
        } catch (err) {
            console.error('Failed to create vision:', err);
        }
    };

    const updateCategoryName = async (visionId: string, newName: string) => {
        if (!newName.trim()) return;

        try {
            const db = await createDatabase();
            const vision = await db.vision_board.findOne(visionId).exec();

            if (vision) {
                const categoryId = await createOrUpdateCategory(newName);
                await vision.patch({
                    category_name: newName.trim(),
                    category_id: categoryId || undefined
                });
            }

            setEditingCategory(null);
        } catch (err) {
            console.error('Failed to update category:', err);
        }
    };

    const deleteVision = async (id: string) => {
        try {
            const db = await createDatabase();
            const doc = await db.vision_board.findOne(id).exec();
            if (doc) {
                await doc.remove();
            }
        } catch (err) {
            console.error('Failed to delete vision:', err);
        }
    };

    if (visions.length === 0 && !showCreateModal) {
        return (
            <div className="glass-card p-12 text-center h-full flex flex-col items-center justify-center">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-blue-500/20 mb-6">
                    <Target className="w-10 h-10 text-blue-400" />
                </div>
                <h3 className="text-2xl font-bold mb-3">Your Vision Board</h3>
                <p className="text-secondary mb-6 max-w-md mx-auto">
                    Create powerful visual anchors for your biggest life goals
                </p>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="px-6 py-3 bg-blue-500 hover:bg-blue-600 rounded-xl font-bold transition-all shadow-lg shadow-[rgba(59,130,246,0.2)]"
                >
                    Create Your First Vision
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Vision Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {visions.map(vision => (
                    <motion.div
                        key={vision.id}
                        layout
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="glass-card overflow-hidden group relative"
                    >
                        {/* Category Title Bar */}
                        <div className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 px-4 py-2 border-b border-white/10">
                            {editingCategory?.visionId === vision.id ? (
                                <input
                                    autoFocus
                                    type="text"
                                    value={editingCategory.name}
                                    onChange={(e) => setEditingCategory({ visionId: vision.id, name: e.target.value })}
                                    onBlur={() => updateCategoryName(vision.id, editingCategory.name)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            updateCategoryName(vision.id, editingCategory.name);
                                        }
                                    }}
                                    className="w-full bg-transparent border-b border-blue-500 text-sm font-bold uppercase tracking-wider focus:outline-none"
                                />
                            ) : (
                                <div
                                    onClick={() => setEditingCategory({ visionId: vision.id, name: vision.category_name || '' })} className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all bg-white/5 border-white/5 hover:bg-white/10" > <span className="text-sm font-bold uppercase tracking-wider flex-1"> {vision.category_name || 'Uncategorized'}
                                    </span>
                                    <Edit2 className="w-3 h-3 opacity-0 group-hover/title:opacity-100 transition-opacity" />
                                </div>
                            )}
                        </div>

                        {/* Visual Anchor */}
                        {vision.visual_anchor ? (
                            <div className="h-48 bg-gradient-to-br from-blue-500/20 to-purple-500/20 relative overflow-hidden">
                                <img
                                    src={vision.visual_anchor}
                                    alt={vision.declaration}
                                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                            </div>
                        ) : (
                            <div className="h-48 bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
                                <Target className="w-16 h-16 text-white/30" />
                            </div>
                        )}

                        {/* Declaration */}
                        <div className="p-6">
                            <h3 className="text-2xl font-bold mb-2 leading-tight">
                                {vision.declaration}
                            </h3>
                            {vision.rpm_purpose && (
                                <p className="text-secondary text-sm line-clamp-2">
                                    {vision.rpm_purpose}
                                </p>
                            )}
                        </div>

                        {/* Delete Button */}
                        <button
                            onClick={() => deleteVision(vision.id)}
                            className="absolute top-12 right-3 p-2 bg-black/50 backdrop-blur-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-300"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </motion.div>
                ))}

                {/* Add New Card */}
                <motion.button
                    onClick={() => setShowCreateModal(true)}
                    className="glass-card p-12 flex flex-col items-center justify-center gap-4 hover:bg-slate-800/50 transition-all border-2 border-dashed border-white/10 hover:border-white/30 min-h-[350px]"
                >
                    <Plus className="w-12 h-12 text-slate-500 group-hover:text-slate-300" />
                    <span className="text-slate-400 font-medium group-hover:text-slate-200">Add Vision</span>
                </motion.button>
            </div>

            {/* Create Modal */}
            {showCreateModal && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
                    onClick={() => setShowCreateModal(false)}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        onClick={(e) => e.stopPropagation()}
                        className="glass-card p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
                    >
                        <h2 className="text-3xl font-bold mb-6">Create Vision</h2>

                        {/* Category Name */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-secondary mb-2">
                                Life Category *
                            </label>
                            <input
                                type="text"
                                value={newCategory}
                                onChange={(e) => setNewCategory(e.target.value)}
                                placeholder="e.g., Health, Wealth, Relationships"
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold uppercase tracking-wider"
                            />
                            <p className="text-xs text-secondary mt-1">This will appear in your Wheel of Life</p>
                        </div>

                        {/* Image Upload */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-secondary mb-2">
                                Visual Anchor (Optional)
                            </label>
                            {imagePreview ? (
                                <div className="relative">
                                    <img
                                        src={imagePreview}
                                        alt="Preview"
                                        className="w-full h-64 object-cover rounded-xl"
                                    />
                                    <button
                                        onClick={() => setImagePreview('')}
                                        className="absolute top-3 right-3 p-2 bg-black/50 backdrop-blur-sm rounded-lg text-red-400"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : (
                                <label className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-white/20 rounded-xl hover:border-white/40 transition-all cursor-pointer">
                                    <Upload className="w-12 h-12 text-secondary mb-3" />
                                    <span className="text-secondary">Click to upload image</span>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleImageUpload}
                                        className="hidden"
                                    />
                                </label>
                            )}
                        </div>

                        {/* Declaration */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-secondary mb-2">
                                Your Declaration *
                            </label>
                            <input
                                type="text"
                                value={newDeclaration}
                                onChange={(e) => setNewDeclaration(e.target.value)}
                                placeholder="e.g., Make $1 Million, Complete Spartan Race"
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-bold"
                            />
                        </div>

                        {/* Purpose */}
                        <div className="mb-8">
                            <label className="block text-sm font-medium text-secondary mb-2">
                                Why This Matters (Optional)
                            </label>
                            <textarea
                                value={newPurpose}
                                onChange={(e) => setNewPurpose(e.target.value)}
                                placeholder="The deeper reason this vision drives you..."
                                rows={3}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                            />
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="flex-1 px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-medium transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={createVision}
                                disabled={!newDeclaration.trim() || !newCategory.trim()}
                                className="flex-1 px-6 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-white/10 disabled:cursor-not-allowed rounded-xl font-bold transition-all shadow-lg shadow-[rgba(59,130,246,0.2)]"
                            >
                                Create Vision
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </div>
    );
}
