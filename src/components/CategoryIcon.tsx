import type { LucideProps } from 'lucide-react';
import { ICON_MAP } from '../utils/icon-utils';

/**
 * Static React component that renders a category icon by name.
 * Using this avoids the "component created during render" ESLint error
 * that occurs when storing the result of getIconComponent() in a variable.
 */
export function CategoryIcon({ name, ...props }: { name?: string } & Omit<LucideProps, 'ref'>) {
    const Icon = name ? ICON_MAP[name] : undefined;
    if (!Icon) return null;
    return <Icon {...props} />;
}
