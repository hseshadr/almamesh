import type { SVGProps } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from './cn';

const SIZES = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-8 w-8' } as const;

export interface SpinnerProps extends Omit<SVGProps<SVGSVGElement>, 'className'> {
  /** Spinner diameter. */
  size?: keyof typeof SIZES;
  /** Extra classes (e.g. text color). */
  className?: string;
  /** Accessible label. */
  label?: string;
}

/**
 * Spinner — a single canonical orbital spinner. Replaces the copy-pasted inline
 * SVG spinners. Inherits color via `currentColor`; defaults to brass.
 */
export function Spinner({ size = 'md', className, label, ...props }: SpinnerProps) {
  const { t } = useTranslation();
  // `label` is an optional override; default to the translated value resolved
  // at render (a prop default can't call a hook).
  const resolvedLabel = label ?? t('loading');
  return (
    <svg
      role="status"
      aria-label={resolvedLabel}
      viewBox="0 0 24 24"
      className={cn('animate-orbit-spin text-accent-gold', SIZES[size], className)}
      {...props}
    >
      <circle
        className="opacity-20"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        fill="none"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V1C5.925 1 1 5.925 1 12h3z"
      />
    </svg>
  );
}
