/**
 * Header Component - Unified header for all pages
 *
 * Features:
 * - Logo always visible (with optional text)
 * - App navigation menu (Dashboard, Settings)
 * - Configurable variants for different page types
 * - Responsive design
 */

import { Link } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Logo } from '../../ui/Logo';

type HeaderVariant = 'default' | 'minimal' | 'transparent';

interface HeaderProps {
  /** Variant style: default (dark bg), minimal (no bg), transparent (glass effect) */
  variant?: HeaderVariant;
  /** Show the AlmaMesh text next to logo */
  showLogoText?: boolean;
  /** Additional content to render in the center */
  centerContent?: React.ReactNode;
  /** Additional content to render on the right (before nav menu) */
  rightContent?: React.ReactNode;
  /** Custom className for the header */
  className?: string;
  /** Whether to show border at bottom */
  showBorder?: boolean;
}

export function Header({
  variant = 'default',
  showLogoText = false,
  centerContent,
  rightContent,
  className = '',
  showBorder = true,
}: HeaderProps) {
  const { t } = useTranslation('common');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  // Close menu on Escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isMenuOpen]);

  // Variant styles
  const variantStyles = {
    default: 'bg-background-primary',
    minimal: 'bg-transparent',
    transparent: 'bg-background-primary/80 backdrop-blur-sm',
  };

  return (
    <header
      className={`sticky top-0 z-40 px-4 md:px-6 py-3 ${variantStyles[variant]} ${showBorder ? 'border-b border-ui-border' : ''
        } ${className}`}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Left: Logo */}
        <Logo size="md" showText={showLogoText} linkToHome />

        {/* Center: Optional content */}
        {centerContent && (
          <div className="hidden md:flex flex-1 justify-center">{centerContent}</div>
        )}

        {/* Right: Navigation menu */}
        <div className="flex items-center gap-3">
          {rightContent}

          <div ref={menuRef} className="relative">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-accent-gold focus:ring-offset-2 focus:ring-offset-background-primary rounded-full transition-all duration-150"
              aria-expanded={isMenuOpen}
              aria-haspopup="true"
              aria-label={t('nav.menu')}
              data-testid="nav-menu-button"
            >
              <svg
                className="w-6 h-6 text-text-secondary hover:text-text-primary transition-colors"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {isMenuOpen && (
              <div
                className="absolute right-0 mt-2 w-56 bg-background-secondary rounded-lg shadow-xl border border-ui-border py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-150"
                role="menu"
                aria-orientation="vertical"
              >
                <div className="py-1">
                  <Link
                    to="/dashboard"
                    onClick={() => setIsMenuOpen(false)}
                    className="w-full text-left px-4 py-2 text-sm text-text-secondary hover:bg-background-tertiary hover:text-text-primary flex items-center gap-3 transition-colors"
                    role="menuitem"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                    {t('nav.dashboard')}
                  </Link>

                  <Link
                    to="/settings/profile"
                    onClick={() => setIsMenuOpen(false)}
                    className="w-full text-left px-4 py-2 text-sm text-text-secondary hover:bg-background-tertiary hover:text-text-primary flex items-center gap-3 transition-colors"
                    role="menuitem"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {t('nav.settings')}
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;
