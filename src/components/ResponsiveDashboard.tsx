import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface ResponsiveDashboardProps {
    children: React.ReactNode;
}

export function ResponsiveDashboard({ children }: ResponsiveDashboardProps) {
    const [containerHeight, setContainerHeight] = useState('100vh');

    useEffect(() => {
        const updateHeight = () => {
            // Calculate available height (viewport - header - padding)
            const headerHeight = 120; // Approximate header height
            const padding = 48; // Total vertical padding
            const availableHeight = window.innerHeight - headerHeight - padding;
            setContainerHeight(`${availableHeight}px`);
        };

        updateHeight();
        window.addEventListener('resize', updateHeight);
        return () => window.removeEventListener('resize', updateHeight);
    }, []);

    // Convert children to array
    const childArray = Array.isArray(children) ? children : [children];

    return (
        <div
            className="w-full mx-auto px-6"
            style={{
                maxWidth: '1600px',
                height: containerHeight,
            }}
        >
            {/* Responsive Grid Container */}
            <div className="grid grid-cols-12 gap-4 h-full">
                {/* Vision Board - Full width top row */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="col-span-12 row-span-4"
                >
                    <div className="glass-card h-full overflow-auto">
                        <div className="sticky top-0 z-10 px-4 py-2 bg-gradient-to-r from-[rgba(59,130,246,0.1)] to-[rgba(168,85,247,0.1)] border-b border-white/10 backdrop-blur-sm">
                            <span className="text-xs text-secondary uppercase tracking-wider">Vision Board</span>
                        </div>
                        <div className="p-4 h-[calc(100%-40px)] overflow-auto">
                            {childArray[0]}
                        </div>
                    </div>
                </motion.div>

                {/* Wheel of Life - Left column */}
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                    className="col-span-12 md:col-span-4 row-span-6"
                >
                    <div className="glass-card h-full overflow-auto">
                        <div className="sticky top-0 z-10 px-4 py-2 bg-gradient-to-r from-[rgba(59,130,246,0.1)] to-[rgba(168,85,247,0.1)] border-b border-white/10 backdrop-blur-sm">
                            <span className="text-xs text-secondary uppercase tracking-wider">Wheel of Life</span>
                        </div>
                        <div className="p-4 h-[calc(100%-40px)] overflow-auto">
                            {childArray[1]}
                        </div>
                    </div>
                </motion.div>

                {/* Projects - Right column */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    className="col-span-12 md:col-span-8 row-span-6"
                >
                    <div className="glass-card h-full overflow-auto">
                        <div className="sticky top-0 z-10 px-4 py-2 bg-gradient-to-r from-[rgba(59,130,246,0.1)] to-[rgba(168,85,247,0.1)] border-b border-white/10 backdrop-blur-sm">
                            <span className="text-xs text-secondary uppercase tracking-wider">Projects</span>
                        </div>
                        <div className="p-4 h-[calc(100%-40px)] overflow-auto">
                            {childArray[2]}
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
