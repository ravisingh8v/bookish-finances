import { AlertTriangle, Home, RefreshCcw, RotateCcw } from "lucide-react";
import { Component, ErrorInfo, ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";

type BoundaryState = {
  error: Error | null;
};

const canShowErrorDetails = () => {
  if (import.meta.env.DEV || import.meta.env.VITE_SHOW_ERROR_DETAILS === "true") {
    return true;
  }
  if (typeof window === "undefined") return false;

  const hostname = window.location.hostname;
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  );
};

class ErrorBoundaryFrame extends Component<
  { children: ReactNode; resetKey: string },
  BoundaryState
> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App error boundary caught an error", error, info);
  }

  componentDidUpdate(prevProps: { resetKey: string }) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  retry = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    const showErrorDetails = canShowErrorDetails();

    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="flex min-h-screen items-center justify-center px-4 py-10">
          <div className="w-full max-w-xl overflow-hidden rounded-lg border bg-card shadow-sm">
            <div className="h-2 bg-gradient-to-r from-primary via-amber-400 to-emerald-500" />
            <div className="space-y-6 p-6 text-center sm:p-8">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="h-7 w-7" />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Something went wrong
                </p>
                <h1 className="text-2xl font-bold tracking-normal sm:text-3xl">
                  We could not load this screen
                </h1>
                <p className="mx-auto max-w-md text-sm leading-6 text-muted-foreground">
                  Your data is safe. Try opening the page again, go back to your
                  books, or refresh the app.
                </p>
              </div>

              {showErrorDetails && (
                <div className="rounded-md border bg-muted/50 p-3 text-left">
                  <p className="line-clamp-3 break-words text-xs text-muted-foreground">
                    {this.state.error.message || "Unexpected application error"}
                  </p>
                </div>
              )}

              <div className="grid gap-2 sm:grid-cols-3">
                <Button onClick={this.retry}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Try again
                </Button>
                <Button asChild variant="outline">
                  <Link to="/books">
                    <Home className="mr-2 h-4 w-4" />
                    Books
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => window.location.reload()}
                >
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  Reload
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export function ErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <ErrorBoundaryFrame resetKey={location.pathname}>
      {children}
    </ErrorBoundaryFrame>
  );
}
