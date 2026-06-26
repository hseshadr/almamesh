import { useId, useState, type ReactNode } from 'react';
import { cn } from './cn';

export interface TooltipProps {
  /** Tooltip text content. */
  content: ReactNode;
  /** The trigger element. */
  children: ReactNode;
  /** Placement relative to the trigger. */
  side?: 'top' | 'bottom';
  className?: string;
}

/**
 * Tooltip — lightweight, accessible (aria-describedby) hover/focus tooltip.
 * CSS-only show/hide so it respects prefers-reduced-motion globally.
 */
export function Tooltip({ content, children, side = 'top', className }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const sidePos =
    side === 'top'
      ? 'bottom-full left-1/2 -translate-x-1/2 mb-2'
      : 'top-full left-1/2 -translate-x-1/2 mt-2';

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span aria-describedby={open ? id : undefined}>{children}</span>
      {open && (
        <span
          role="tooltip"
          id={id}
          className={cn(
            'pointer-events-none absolute z-50 whitespace-nowrap rounded-md border border-ui-border',
            'bg-background-elevated px-2.5 py-1.5 font-sans text-xs text-text-body',
            'shadow-[0_8px_24px_-10px_rgba(0,0,0,0.7)]',
            sidePos,
            className,
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
