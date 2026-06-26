import { Component, ReactNode } from 'react';
import { withTranslation, type WithTranslation } from 'react-i18next';

import { resetAppData } from '../lib/resetAppData';

interface OwnProps {
  children: ReactNode;
  fallback?: ReactNode;
}

type Props = OwnProps & WithTranslation;

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary component that catches JavaScript errors anywhere in the child
 * component tree, logs the error, and displays a fallback UI.
 */
class ErrorBoundaryBase extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // ALWAYS log the real underlying error + componentStack so a blank
    // "Something went wrong" fallback can never hide the cause again (a stale
    // service worker / older-schema persisted store once white-screened
    // returning visitors with no console trace). By design this stays on-device:
    // AlmaMesh is local-first and zero-egress — no telemetry backend, no Sentry,
    // nothing here leaves the browser.
    console.error('ErrorBoundary caught an error:', error, errorInfo.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  /**
   * The bulletproof escape hatch for a stranded returning visitor: wipe every
   * stale-state source (service worker, caches, localStorage, IndexedDB) then
   * reload into a clean boot. Best-effort cleanup never blocks the reload.
   */
  handleResetAppData = () => {
    void resetAppData().finally(() => window.location.reload());
  };

  render() {
    const { t } = this.props;
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-md w-full bg-surface rounded-xl shadow-lg p-6 text-center">
            <div className="text-4xl mb-4">
              <span role="img" aria-label={t('error_boundary.warning_aria')}>⚠️</span>
            </div>
            <h1 className="text-xl font-semibold text-text-primary mb-2">
              {t('error_boundary.title')}
            </h1>
            <p className="text-text-secondary mb-6">
              {t('error_boundary.body')}
            </p>
            {import.meta.env.DEV && this.state.error && (
              <details className="text-left mb-4 p-3 bg-red-50 rounded-lg text-sm">
                <summary className="cursor-pointer text-red-700 font-medium">
                  {t('error_boundary.details')}
                </summary>
                <pre className="mt-2 text-red-600 overflow-auto text-xs">
                  {this.state.error.message}
                  {'\n'}
                  {this.state.error.stack}
                </pre>
              </details>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 transition-colors"
              >
                {t('error_boundary.try_again')}
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                {t('error_boundary.refresh')}
              </button>
            </div>
            {/* The bulletproof escape hatch: clears stale SW + caches + storage. */}
            <div className="mt-6 pt-4 border-t border-border-subtle">
              <p className="text-text-tertiary text-xs mb-2">
                {t('error_boundary.reset_hint')}
              </p>
              <button
                onClick={this.handleResetAppData}
                className="px-4 py-2 text-red-700 border border-red-300 rounded-lg hover:bg-red-50 transition-colors text-sm"
              >
                {t('error_boundary.reset_app_data')}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const ErrorBoundary = withTranslation()(ErrorBoundaryBase);

export { ErrorBoundary };
export default ErrorBoundary;
