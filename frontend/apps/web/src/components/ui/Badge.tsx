import { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

/**
 * Badge — a small engraved label / status pill in the observatory palette.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 ' +
    'font-mono text-xs font-medium tracking-wide',
  {
    variants: {
      variant: {
        default: 'border-ui-border bg-background-elevated text-text-secondary',
        brass: 'border-accent-gold/40 bg-accent-gold/10 text-accent-gold',
        lapis: 'border-accent-lapis/40 bg-accent-lapis/10 text-accent-blue',
        success: 'border-status-success/40 bg-status-success/10 text-status-success',
        warning: 'border-status-warning/40 bg-status-warning/10 text-status-warning',
        error: 'border-status-error/40 bg-status-error/10 text-status-error',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => (
    <span ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
  ),
);

Badge.displayName = 'Badge';

export { badgeVariants };
