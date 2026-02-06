import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
    children: ReactNode;
    widgetTitle?: string;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class WidgetErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false, error: null };

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error(`[WidgetErrorBoundary] ${this.props.widgetTitle || 'Widget'} crashed:`, error, info.componentStack);
    }

    private handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                    <AlertTriangle className="w-8 h-8 text-amber-400 mb-3" />
                    <p className="text-sm font-medium text-slate-300 mb-1">
                        {this.props.widgetTitle || 'Widget'} failed to load
                    </p>
                    <p className="text-xs text-slate-500 mb-4 max-w-[200px]">
                        {this.state.error?.message || 'An unexpected error occurred'}
                    </p>
                    <button
                        onClick={this.handleRetry}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs text-slate-300 transition-colors"
                    >
                        <RefreshCw className="w-3 h-3" />
                        Retry
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
