import React, { useEffect, useRef, useState } from "react";
import type { Layout } from "react-grid-layout";

/*
 * Legacy width provider from RGL often causes hydration mismatch or
 * fails to update on rapid window resize. This custom implementation
 * uses a ResizeObserver to explicitly measure the container width.
 */
export interface WidthProviderProps {
    measureBeforeMount?: boolean;
    className?: string;
    style?: React.CSSProperties;
    width?: number;
    children?: React.ReactNode;
    onLayoutChange?: (layout: Layout[]) => void;
}

export function WidthProvider<P>(
    ComposedComponent: React.ComponentType<P>
): React.FC<P & WidthProviderProps> {
    function WidthProviderWrapper(props: P & WidthProviderProps) {
        const [width, setWidth] = useState<number>(1200);
        const [mounted, setMounted] = useState(false);
        const containerRef = useRef<HTMLDivElement>(null);

        const refCallback = React.useCallback((node: HTMLDivElement | null) => {
            if (node) {
                containerRef.current = node;
                setWidth(node.offsetWidth);
                setMounted(true);
            }
        }, []);

        useEffect(() => {
            if (!containerRef.current) return;

            const observer = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    // Use contentRect for precise content box measurement
                    setWidth(entry.contentRect.width);
                }
            });

            observer.observe(containerRef.current);

            return () => {
                observer.disconnect();
            };
        }, [mounted]);

        // Prevent hydration mismatch by rendering a placeholder or default width first
        // optionally could wait for mount, but RGL handles width updates well if passed
        return (
            <div
                ref={refCallback}
                className={props.className}
                style={{ width: '100%', ...props.style }}
            >
                {mounted && width > 0 ? (
                    <ComposedComponent
                        {...props}
                        width={width}
                    // Ensure we pass through all other props
                    />
                ) : (
                    // Render invisible placeholder to allow ref attachment without layout jump
                    <div style={{ height: '100px' }} />
                )}
            </div>
        );
    }

    WidthProviderWrapper.displayName = `WidthProvider(${ComposedComponent.displayName || ComposedComponent.name || 'Component'})`;
    return WidthProviderWrapper;
}
