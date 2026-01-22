// Time formatting utilities

export function formatTimeEstimate(minutes: number): string {
    if (minutes === 0) return '0m';

    // Convert to months if >= 30 days
    const months = Math.floor(minutes / (30 * 24 * 60));
    if (months >= 1) {
        const remainingMinutes = minutes % (30 * 24 * 60);
        if (remainingMinutes === 0) {
            return `${months}mo`;
        }
        // Show months + days if there's a remainder
        const days = Math.floor(remainingMinutes / (24 * 60));
        return days > 0 ? `${months}mo ${days}d` : `${months}mo`;
    }

    // Convert to days if >= 1 day
    const days = Math.floor(minutes / (24 * 60));
    if (days >= 1) {
        const remainingMinutes = minutes % (24 * 60);
        if (remainingMinutes === 0) {
            return `${days}d`;
        }
        // Show days + hours if there's a remainder
        const hours = Math.floor(remainingMinutes / 60);
        return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
    }

    // Convert to hours if >= 1 hour
    const hours = Math.floor(minutes / 60);
    if (hours >= 1) {
        const remainingMinutes = minutes % 60;
        return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
    }

    // Just minutes
    return `${minutes}m`;
}
