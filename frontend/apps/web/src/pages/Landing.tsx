import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LandingNav,
  Hero,
  WhatSection,
  WhatYouCanDoSection,
  ComparisonSection,
  HowItWorksSection,
  WhoSection,
  WhereWhenSection,
  FounderNote,
  TrustSection,
  FinalCta,
  LandingFooter,
} from '../components/features/landing';

/**
 * The AlmaMesh marketing splash, rendered at `/` for first-time visitors
 * (outside `AppLayout` — it owns its own full-bleed chrome). It explains what
 * AlmaMesh is and why it's different, and routes the curious into onboarding.
 *
 * Engine-respect: this page is intentionally engine-free. It NEVER imports
 * `@almamesh/browser` at runtime — the signature hero force-field is driven by a
 * static `DEMO_CHART` fixture, so a bouncing visitor downloads nothing of the
 * ~38 MB engine. The bootstrap is deferred and only prewarmed once the visitor
 * shows intent on a "Generate my chart" CTA (see `usePrewarmEngineOnIntent`).
 */
export default function Landing(): ReactElement {
  // Establish the `landing` namespace as the page default so nested sections
  // resolve their keys without repeating the namespace prefix.
  useTranslation('landing');

  return (
    <div className="min-h-screen bg-observatory font-sans text-text-primary antialiased">
      <LandingNav />
      <main>
        <Hero />
        <WhatSection />
        <WhatYouCanDoSection />
        <ComparisonSection />
        <HowItWorksSection />
        <WhoSection />
        <WhereWhenSection />
        <FounderNote />
        <TrustSection />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
