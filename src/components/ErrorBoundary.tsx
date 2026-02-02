import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false, error: null };

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
    }

    private handleReload = () => {
        window.location.reload();
    };

    private handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-8">
                    <div className="max-w-md text-center space-y-4">
                        <h1 className="text-2xl font-bold text-red-400">Something went wrong</h1>
                        <p className="text-slate-400 text-sm">
                            {this.state.error?.message || 'An unexpected error occurred.'}
                        </p>
                        <div className="flex gap-3 justify-center pt-2">
                            <button
                                onClick={this.handleReset}
                                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm transition-colors"
                            >
                                Try Again
                            </button>
                            <button
                                onClick={this.handleReload}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm transition-colors"
                            >
                                Reload Page
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

/** Page-level error boundary — renders inline within the app shell */
interface PageErrorBoundaryProps {
    children: ReactNode;
    pageName?: string;
}

interface PageErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

export class PageErrorBoundary extends Component<PageErrorBoundaryProps, PageErrorBoundaryState> {
    state: PageErrorBoundaryState = { hasError: false, error: null };

    static getDerivedStateFromError(error: Error): PageErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error(`[PageErrorBoundary] ${this.props.pageName || 'Page'} crashed:`, error, info.componentStack);
    }

    private handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
                    <AlertTriangle className="w-12 h-12 text-amber-400 mb-4" />
                    <h2 className="text-xl font-bold text-slate-200 mb-2">
                        {this.props.pageName || 'This page'} encountered an error
                    </h2>
                    <p className="text-sm text-slate-400 mb-6 max-w-md">
                        {this.state.error?.message || 'An unexpected error occurred.'}
                    </p>
                    <button
                        onClick={this.handleRetry}
                        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors"
                    >
                        Try Again
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
