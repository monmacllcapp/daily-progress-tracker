import React, { useEffect, useRef, useState } from "react";
import { WidthProvider as RGLWidthProvider, Layout } from "react-grid-layout";

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
    return (props: P & WidthProviderProps) => {
        const [width, setWidth] = useState<number>(1200);
        const [mounted, setMounted] = useState(false);
        const containerRef = useRef<HTMLDivElement>(null);

        useEffect(() => {
            setMounted(true);

            if (!containerRef.current) return;

            const observer = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    // Use contentRect for precise content box measurement
                    setWidth(entry.contentRect.width);
                }
            });

            observer.observe(containerRef.current);

            // Initial measure
            setWidth(containerRef.current.offsetWidth);

            return () => {
                observer.disconnect();
            };
        }, []);

        // Prevent hydration mismatch by rendering a placeholder or default width first
        // optionally could wait for mount, but RGL handles width updates well if passed
        return (
            <div
                ref={containerRef}
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
    };
}
