import { Link } from "react-router-dom";

// Size variants for the logo
const sizeConfig = {
  sm: { icon: 24, text: "text-lg" },
  md: { icon: 32, text: "text-xl" },
  lg: { icon: 48, text: "text-2xl" },
  xl: { icon: 64, text: "text-3xl" },
  "2xl": { icon: 96, text: "text-4xl" },
  "3xl": { icon: 128, text: "text-5xl" },
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
        width={config.icon}
        height={config.icon}
        className="object-contain"
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
