import gsap from 'gsap';
import { DURATIONS } from '../constants';
import { GSAP_EASINGS } from '../constants/easings';

/**
 * Elements required for the hero animation.
 */
export interface HeroElements {
  container: HTMLElement;
  title: HTMLElement;
  subtitle: HTMLElement;
  stars: NodeListOf<HTMLElement> | HTMLElement[];
  cta: HTMLElement;
  /** Optional background element for parallax */
  background?: HTMLElement;
}

/**
 * Creates the main hero animation timeline.
 * Stars fade in with random stagger, then text reveals, then CTA.
 *
 * @param elements - DOM elements to animate
 * @returns GSAP timeline for control (play, pause, reverse, etc.)
 *
 * @example
 * ```tsx
 * function HeroSection() {
 *   const containerRef = useRef<HTMLDivElement>(null);
 *
 *   useGSAP(() => {
 *     if (!containerRef.current) return;
 *
 *     const elements: HeroElements = {
 *       container: containerRef.current,
 *       title: containerRef.current.querySelector('.hero-title')!,
 *       subtitle: containerRef.current.querySelector('.hero-subtitle')!,
 *       stars: containerRef.current.querySelectorAll('.star'),
 *       cta: containerRef.current.querySelector('.cta-button')!,
 *     };
 *
 *     const timeline = createHeroTimeline(elements);
 *     // Timeline plays automatically
 *   }, []);
 *
 *   return (
 *     <section ref={containerRef}>
 *       <div className="stars-container">
 *         {Array.from({ length: 50 }).map((_, i) => (
 *           <span key={i} className="star" />
 *         ))}
 *       </div>
 *       <h1 className="hero-title">...</h1>
 *       <p className="hero-subtitle">...</p>
 *       <button className="cta-button">...</button>
 *     </section>
 *   );
 * }
 * ```
 */
export function createHeroTimeline(elements: HeroElements): gsap.core.Timeline {
  const { title, subtitle, stars, cta, background } = elements;

  const tl = gsap.timeline({
    defaults: {
      ease: GSAP_EASINGS.smooth,
    },
  });

  // Optional background parallax setup
  if (background) {
    tl.set(background, { scale: 1.1 });
  }

  // Stars fade in with random stagger
  if (stars.length > 0) {
    tl.fromTo(
      stars,
      {
        opacity: 0,
        scale: 0,
      },
      {
        opacity: 1,
        scale: 1,
        duration: DURATIONS.slow,
        stagger: {
          each: 0.02,
          from: 'random',
        },
      }
    );
  }

  // Title reveals with slight overlap
  tl.fromTo(
    title,
    {
      opacity: 0,
      y: 40,
    },
    {
      opacity: 1,
      y: 0,
      duration: DURATIONS.medium,
    },
    stars.length > 0 ? '-=0.5' : 0
  );

  // Subtitle reveals
  tl.fromTo(
    subtitle,
    {
      opacity: 0,
      y: 20,
    },
    {
      opacity: 1,
      y: 0,
      duration: DURATIONS.medium,
    },
    '-=0.3'
  );

  // CTA appears with emphasis
  tl.fromTo(
    cta,
    {
      opacity: 0,
      y: 20,
      scale: 0.95,
    },
    {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: DURATIONS.medium,
      ease: GSAP_EASINGS.back,
    },
    '-=0.2'
  );

  return tl;
}

/**
 * Creates a simpler hero animation for performance-constrained scenarios.
 */
export function createSimpleHeroTimeline(
  elements: Pick<HeroElements, 'title' | 'subtitle' | 'cta'>
): gsap.core.Timeline {
  const { title, subtitle, cta } = elements;

  const tl = gsap.timeline({
    defaults: {
      ease: GSAP_EASINGS.smooth,
      duration: DURATIONS.medium,
    },
  });

  tl.fromTo(
    title,
    { opacity: 0, y: 30 },
    { opacity: 1, y: 0 }
  )
    .fromTo(
      subtitle,
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0 },
      '-=0.2'
    )
    .fromTo(
      cta,
      { opacity: 0, y: 15 },
      { opacity: 1, y: 0 },
      '-=0.15'
    );

  return tl;
}

/**
 * Creates floating star animation for idle state.
 * Call after hero animation completes for subtle ambient motion.
 */
export function createStarFloatAnimation(
  stars: NodeListOf<HTMLElement> | HTMLElement[]
): gsap.core.Timeline {
  const tl = gsap.timeline({ repeat: -1, yoyo: true });

  tl.to(stars, {
    y: 'random(-10, 10)',
    x: 'random(-5, 5)',
    duration: 'random(3, 5)',
    ease: 'sine.inOut',
    stagger: {
      each: 0.1,
      from: 'random',
    },
  });

  return tl;
}

/**
 * Creates a text split animation for dramatic reveals.
 * Requires text to be split into individual characters or words.
 */
export function createTextRevealTimeline(
  chars: HTMLElement[],
  options: { fromBottom?: boolean; stagger?: number } = {}
): gsap.core.Timeline {
  const { fromBottom = true, stagger = 0.03 } = options;

  const tl = gsap.timeline();

  tl.fromTo(
    chars,
    {
      opacity: 0,
      y: fromBottom ? 50 : -50,
      rotateX: fromBottom ? -90 : 90,
    },
    {
      opacity: 1,
      y: 0,
      rotateX: 0,
      duration: DURATIONS.medium,
      stagger,
      ease: GSAP_EASINGS.smooth,
    }
  );

  return tl;
}
