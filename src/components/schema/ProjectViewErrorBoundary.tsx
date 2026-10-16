'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export interface ProjectViewErrorBoundaryProps {
  children: ReactNode;
  onResetToDefault?: () => void | Promise<void>;
  fallbackTitle?: string;
}

interface ProjectViewErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ProjectViewErrorBoundary extends Component<
  ProjectViewErrorBoundaryProps,
  ProjectViewErrorBoundaryState
> {
  constructor(props: ProjectViewErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): ProjectViewErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ProjectViewErrorBoundary caught a schema rendering exception:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onResetToDefault) {
      try {
        const res = this.props.onResetToDefault();
        if (res && typeof (res as any).catch === 'function') {
          (res as Promise<void>).catch((err) => {
            console.error('Failed to reset project schema to default:', err);
          });
        }
      } catch (err) {
        console.error('Failed to reset project schema to default:', err);
      }
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          data-testid="project-view-error-boundary"
          className="my-6 p-6 rounded-2xl bg-red-950/30 border border-red-800/60 shadow-2xl backdrop-blur max-w-2xl mx-auto space-y-4 animate-in fade-in"
        >
          <div className="flex items-start space-x-3">
            <div className="p-2.5 rounded-xl bg-red-900/40 border border-red-700/50 text-red-400 shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-red-200">
                {this.props.fallbackTitle || 'Malformed Project Schema — Reset to Default'}
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                A schema hydration or structure mismatch prevented this view from rendering cleanly.
                You can restore the project schema to SunShade baseline defaults with 1 click.
              </p>
            </div>
          </div>

          {this.state.error && (
            <div className="p-3 rounded-lg bg-black/40 border border-red-900/40 font-mono text-xs text-red-300 break-all">
              {this.state.error.message || String(this.state.error)}
            </div>
          )}

          <div className="flex items-center space-x-3 pt-2">
            <button
              type="button"
              data-testid="reset-schema-to-default-btn"
              onClick={this.handleReset}
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold flex items-center space-x-2 transition-all shadow-lg shadow-red-600/30 hover:shadow-red-600/50 active:scale-95"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reset to Default Schema</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
