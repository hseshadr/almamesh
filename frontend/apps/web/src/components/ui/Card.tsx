import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

/**
 * Card — an engraved observatory panel. Hairline 1px border over an elevated
 * obsidian surface, with an optional header (title + subtitle + actions slot).
 */
export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Optional header title. Rendered in the display font. */
  title?: ReactNode;
  /** Optional subtitle under the title. */
  subtitle?: ReactNode;
  /** Optional right-aligned header actions. */
  actions?: ReactNode;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, title, subtitle, actions, children, ...props }, ref) => {
    const hasHeader = title != null || subtitle != null || actions != null;
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-lg border border-ui-border bg-background-secondary',
          'shadow-[0_8px_32px_-12px_rgba(0,0,0,0.6)]',
          className,
        )}
        {...props}
      >
        {hasHeader && (
          <div className="flex items-start justify-between gap-4 border-b border-ui-border px-5 py-4">
            <div className="min-w-0">
              {title != null && (
                <h3 className="font-display text-lg leading-tight text-text-primary">{title}</h3>
              )}
              {subtitle != null && (
                <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>
              )}
            </div>
            {actions != null && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
          </div>
        )}
        <div className="px-5 py-4">{children}</div>
      </div>
    );
  },
);

Card.displayName = 'Card';
