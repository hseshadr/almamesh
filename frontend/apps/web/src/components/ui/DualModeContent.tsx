/**
 * DualModeContent - Display for layman/technical interpretations
 *
 * Shows content based on the global content mode preference.
 * Uses the ContentModeStore for global state management.
 * Falls back gracefully when only one content type is available.
 */

import { useContentModeStore } from '../../stores/contentMode';
import { MarkdownContent } from './MarkdownContent';

interface DualModeContentProps {
  layman?: string | null;
  technical?: string | null;
  className?: string;
}

export function DualModeContent({
  layman,
  technical,
  className = '',
}: DualModeContentProps) {
  const contentMode = useContentModeStore((state) => state.contentMode);

  // Check if content exists
  const hasLayman = layman && layman.trim().length > 0;
  const hasTechnical = technical && technical.trim().length > 0;

  if (!hasLayman && !hasTechnical) {
    return null;
  }

  // Pick the text to show: the only available mode, else the global preference.
  let text: string;
  if (hasLayman && !hasTechnical) {
    text = layman!;
  } else if (!hasLayman && hasTechnical) {
    text = technical!;
  } else {
    text = contentMode === 'layman' ? layman! : technical!;
  }

  // Render through MarkdownContent so the reading shares the one readable
  // measure + relaxed line-height (no more squashed bare <p>).
  return <MarkdownContent content={text} className={className} compact />;
}

export default DualModeContent;
