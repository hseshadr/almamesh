import { Link } from "react-router-dom";

// Size variants for the logo.
//
// `px` is the intrinsic width/height attribute (reserves space, avoids layout
// shift); `icon` is the rendered size as static Tailwind classes, which CSS
// applies over the attributes. Keeping the classes as complete literal strings
// is deliberate — Tailwind's JIT only emits classes it can see statically, so
// these must never be assembled from variables.
const sizeConfig = {
  sm: { px: 24, icon: "h-6 w-6", text: "text-lg" },
  md: { px: 32, icon: "h-8 w-8", text: "text-xl" },
  lg: { px: 48, icon: "h-12 w-12", text: "text-2xl" },
  xl: { px: 64, icon: "h-16 w-16", text: "text-3xl" },
  "2xl": { px: 96, icon: "h-24 w-24", text: "text-4xl" },
  "3xl": { px: 128, icon: "h-32 w-32", text: "text-5xl" },
  /**
   * Splash hero — the only responsive variant. A fixed 96px mark plus
   * `text-4xl` dominates a 390px phone while reading as modest on a 1440px
   * laptop; this steps both down below the `sm` breakpoint so the wordmark
   * keeps a consistent visual weight across viewports.
   */
  hero: { px: 96, icon: "h-16 w-16 sm:h-24 sm:w-24", text: "text-3xl sm:text-4xl" },
} as const;

type LogoSize = keyof typeof sizeConfig;

interface LogoProps {
  /** Size variant: sm (24px), md (32px), lg (48px), xl (64px), 2xl (96px), 3xl (128px) */
  size?: LogoSize;
  /** Whether to show "AlmaMesh" text next to the icon */
  showText?: boolean;
  /** Additional className for the container */
  className?: string;
  /** Whether to wrap in a Link to home */
  linkToHome?: boolean;
}

/**
 * AlmaMesh Logo Component
 *
 * Displays the network globe icon with optional "AlmaMesh" text.
 * Uses the new brand logo with interconnected nodes design.
 */
export function Logo({
  size = "md",
  showText = false,
  className = "",
  linkToHome = false,
}: LogoProps) {
  const config = sizeConfig[size];

  const content = (
    <div className={`flex items-center gap-3 ${className}`}>
      <img
        src="/logo.png"
        alt="AlmaMesh"
        width={config.px}
        height={config.px}
        className={`object-contain ${config.icon}`}
      />

      {showText && (
        <span className={`font-semibold text-text-secondary ${config.text}`}>
          AlmaMesh
        </span>
      )}
    </div>
  );

  if (linkToHome) {
    return (
      <Link to="/" className="inline-flex">
        {content}
      </Link>
    );
  }

  return content;
}

// Named export for the logo icon alone (useful for favicons, loading states, etc.)
export function LogoIcon({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src="/logo.png"
      alt="AlmaMesh"
      width={size}
      height={size}
      className={`object-contain ${className}`}
    />
  );
}

export default Logo;
