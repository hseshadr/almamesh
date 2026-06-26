/**
 * ChartStyleToggle — segmented control for North vs South Indian chart style.
 *
 * Reads + writes the `displayStyle` field of the chart UI store
 * (`'north' | 'south'`), so any chart consumer can switch styles in one place.
 */

import { type JSX } from 'react';
import { useChartStore, type ChartDisplayStyle } from '@almamesh/store';
import { Tabs, TabsList, TabsTrigger } from '../ui/Tabs';

const STYLE_OPTIONS: readonly { readonly value: ChartDisplayStyle; readonly label: string }[] = [
  { value: 'north', label: 'North' },
  { value: 'south', label: 'South' },
];

export interface ChartStyleToggleProps {
  readonly className?: string;
}

/** Segmented North / South toggle bound to the chart store's `displayStyle`. */
export function ChartStyleToggle({ className }: ChartStyleToggleProps): JSX.Element {
  const displayStyle = useChartStore((state) => state.displayStyle);
  const setDisplayStyle = useChartStore((state) => state.setDisplayStyle);

  return (
    <Tabs
      value={displayStyle}
      onValueChange={(value) => setDisplayStyle(value as ChartDisplayStyle)}
      className={className}
    >
      <TabsList>
        {STYLE_OPTIONS.map((option) => (
          <TabsTrigger key={option.value} value={option.value}>
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
