import { useEffect, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface Shortcut {
    key: string;
    ctrl?: boolean;
    shift?: boolean;
    description: string;
    action: () => void;
}

export function useKeyboardShortcuts() {
    const navigate = useNavigate();

    const shortcuts: Shortcut[] = [
        { key: 'd', ctrl: true, shift: true, description: 'Go to Dashboard', action: () => navigate('/') },
        { key: 't', ctrl: true, shift: true, description: 'Go to Tasks', action: () => navigate('/tasks') },
        { key: 'c', ctrl: true, shift: true, description: 'Go to Calendar', action: () => navigate('/calendar') },
        { key: 'e', ctrl: true, shift: true, description: 'Go to Email', action: () => navigate('/email') },
        { key: 'l', ctrl: true, shift: true, description: 'Go to Life', action: () => navigate('/life') },
        { key: 'j', ctrl: true, shift: true, description: 'Go to Journal', action: () => navigate('/journal') },
        { key: 'p', ctrl: true, shift: true, description: 'Go to Projects', action: () => navigate('/projects') },
        { key: 'm', ctrl: true, shift: true, description: 'Start Morning Flow', action: () => navigate('/morning') },
    ];

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // Don't trigger shortcuts when typing in inputs
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) {
            return;
        }

        for (const shortcut of shortcuts) {
            const ctrlMatch = shortcut.ctrl ? (e.ctrlKey || e.metaKey) : true;
            const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
            const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();

            if (ctrlMatch && shiftMatch && keyMatch) {
                e.preventDefault();
                shortcut.action();
                return;
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [navigate]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    return shortcuts;
}

export function useShortcutHelp() {
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
                const target = e.target as HTMLElement;
                if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) {
                    return;
                }
                e.preventDefault();
                setIsOpen(prev => !prev);
            }
            if (e.key === 'Escape' && isOpen) {
                setIsOpen(false);
            }
        };

        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isOpen]);

    return { isOpen, setIsOpen };
}
