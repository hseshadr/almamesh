/** Initials for the avatar chip: first letters of up to two name words. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  const first = parts[0]?.[0] ?? '';
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + second).toUpperCase();
}

export interface AvatarChipProps {
  readonly tint: string;
  readonly name: string;
  readonly size?: 'sm' | 'md';
}

/**
 * AvatarChip — a round, tinted avatar showing a person's initials. Shared by
 * the header ProfileSwitcher and the Settings → People mesh surface.
 */
export function AvatarChip({ tint, name, size = 'md' }: AvatarChipProps) {
  const dim = size === 'sm' ? 'h-6 w-6 text-[0.65rem]' : 'h-7 w-7 text-xs';
  return (
    <span
      aria-hidden="true"
      className={`inline-flex ${dim} items-center justify-center rounded-full font-sans font-medium text-background-darkest`}
      style={{ backgroundColor: tint }}
    >
      {initialsOf(name)}
    </span>
  );
}
