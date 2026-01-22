import { type ReactNode } from 'react';
import { motion } from 'framer-motion';

interface BentoGridProps {
    children: ReactNode;
}

export function BentoGrid({ children }: BentoGridProps) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 auto-rows-auto"
        >
            {children}
        </motion.div>
    );
}

interface BentoCardProps {
    children: ReactNode;
    className?: string;
    span?: 'full' | 'half' | 'third' | 'two-thirds';
}

export function BentoCard({ children, className = '', span = 'full' }: BentoCardProps) {
    const spanClasses = {
        'full': 'lg:col-span-12',
        'half': 'lg:col-span-6',
        'third': 'lg:col-span-4',
        'two-thirds': 'lg:col-span-8'
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className={`${spanClasses[span]} ${className}`}
        >
            {children}
        </motion.div>
    );
}
