import type { LucideIcon } from 'lucide-react';
import {
    Heart, DollarSign, Brain, Users, Briefcase, Dumbbell, Book, Music,
    Globe, Sparkles, Home, Palette, Target, Flame, Shield, Star,
} from 'lucide-react';

export const ICON_OPTIONS: { name: string; icon: LucideIcon }[] = [
    { name: 'heart', icon: Heart },
    { name: 'dollar-sign', icon: DollarSign },
    { name: 'brain', icon: Brain },
    { name: 'users', icon: Users },
    { name: 'briefcase', icon: Briefcase },
    { name: 'dumbbell', icon: Dumbbell },
    { name: 'book', icon: Book },
    { name: 'music', icon: Music },
    { name: 'globe', icon: Globe },
    { name: 'sparkles', icon: Sparkles },
    { name: 'home', icon: Home },
    { name: 'palette', icon: Palette },
    { name: 'target', icon: Target },
    { name: 'flame', icon: Flame },
    { name: 'shield', icon: Shield },
    { name: 'star', icon: Star },
];

export const ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
    ICON_OPTIONS.map(({ name, icon }) => [name, icon])
);

export function getIconComponent(iconName?: string): LucideIcon | null {
    if (!iconName) return null;
    return ICON_MAP[iconName] ?? null;
}
