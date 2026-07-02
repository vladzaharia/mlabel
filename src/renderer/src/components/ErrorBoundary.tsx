import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "./ui/button";

interface ErrorBoundaryState {
  error: Error | null;
}

/** App-level boundary: a render crash shows a friendly screen, not a blank window. */
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="app-base flex h-full flex-col">
        <div className="drag flex h-11 shrink-0 items-center" />
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="glass-card flex w-full max-w-xl flex-col gap-4 rounded-2xl border border-border p-8 shadow-xl">
            <div className="flex items-center gap-3 text-danger">
              <AlertTriangle size={20} />
              <h1 className="text-base font-semibold">Something went wrong</h1>
            </div>
            <p className="text-muted-foreground text-sm">
              MLabel hit an unexpected error. Your labeling progress is saved automatically and will
              be offered again after a reload.
            </p>
            <div className="max-h-72 overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs">
              {this.state.error.message}
            </div>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
