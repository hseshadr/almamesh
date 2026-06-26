/**
 * Marketing splash building blocks. Every module here is ENGINE-FREE: none
 * imports `@almamesh/browser` at runtime (the hero uses the static `DEMO_CHART`
 * fixture + the pure `buildEnergyFrame` adapter only), so the landing chunk stays
 * light and a bouncing visitor never downloads the ~38 MB engine.
 */
export { LandingNav } from './LandingNav';
export { LandingFooter, GITHUB_URL } from './LandingFooter';
export { Hero } from './Hero';
export { HeroForceField } from './HeroForceField';
export { WhatSection } from './WhatSection';
export { WhatYouCanDoSection } from './WhatYouCanDoSection';
export { ComparisonSection } from './ComparisonSection';
export { HowItWorksSection } from './HowItWorksSection';
export { WhoSection } from './WhoSection';
export { WhereWhenSection } from './WhereWhenSection';
export { FounderNote } from './FounderNote';
export { TrustSection } from './TrustSection';
export { FinalCta } from './FinalCta';
