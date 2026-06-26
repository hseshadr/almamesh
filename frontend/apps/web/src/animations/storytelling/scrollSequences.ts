import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { GSAP_EASINGS } from '../constants/easings';

// Ensure ScrollTrigger is registered
gsap.registerPlugin(ScrollTrigger);

/**
 * Configuration for scroll-driven narrative sections.
 */
export interface ScrollNarrativeConfig {
  /** Container element that holds all sections */
  container: HTMLElement;
  /** Individual section elements to animate */
  sections: HTMLElement[];
  /** Callback when a section becomes active */
  onSectionEnter?: (index: number) => void;
  /** Callback when a section is left */
  onSectionLeave?: (index: number) => void;
  /** How much to scroll per section (default: 100vh) */
  scrollPerSection?: number;
}

/**
 * Creates a scroll-driven narrative where sections fade in/out as user scrolls.
 * The container is pinned while content scrolls through.
 *
 * @example
 * ```tsx
 * function StorySection() {
 *   const containerRef = useRef<HTMLDivElement>(null);
 *
 *   useGSAP(() => {
 *     if (!containerRef.current) return;
 *
 *     const sections = containerRef.current.querySelectorAll('.story-section');
 *
 *     createScrollNarrative({
 *       container: containerRef.current,
 *       sections: Array.from(sections) as HTMLElement[],
 *       onSectionEnter: (index) => console.log('Entered section', index),
 *     });
 *   }, []);
 *
 *   return (
 *     <div ref={containerRef} className="story-container">
 *       <div className="story-section">Section 1</div>
 *       <div className="story-section">Section 2</div>
 *       <div className="story-section">Section 3</div>
 *     </div>
 *   );
 * }
 * ```
 */
export function createScrollNarrative(
  config: ScrollNarrativeConfig
): gsap.core.Timeline {
  const {
    container,
    sections,
    onSectionEnter,
    onSectionLeave,
    scrollPerSection = 100,
  } = config;

  // Create master timeline
  const masterTimeline = gsap.timeline({
    scrollTrigger: {
      trigger: container,
      start: 'top top',
      end: `+=${sections.length * scrollPerSection}%`,
      scrub: 1,
      pin: true,
      anticipatePin: 1,
    },
  });

  // Animate each section
  sections.forEach((section, index) => {
    // Set initial state
    gsap.set(section, { opacity: 0, y: 50 });

    // Fade in
    masterTimeline.to(
      section,
      {
        opacity: 1,
        y: 0,
        duration: 1,
        ease: GSAP_EASINGS.smooth,
      },
      index
    );

    // Fade out (except last section)
    if (index < sections.length - 1) {
      masterTimeline.to(
        section,
        {
          opacity: 0,
          y: -50,
          duration: 1,
          ease: GSAP_EASINGS.smooth,
        },
        index + 0.8
      );
    }

    // Section enter/leave callbacks
    if (onSectionEnter || onSectionLeave) {
      ScrollTrigger.create({
        trigger: section,
        start: 'top center',
        end: 'bottom center',
        onEnter: () => onSectionEnter?.(index),
        onLeave: () => onSectionLeave?.(index),
        onEnterBack: () => onSectionEnter?.(index),
        onLeaveBack: () => onSectionLeave?.(index),
      });
    }
  });

  return masterTimeline;
}

/**
 * Configuration for parallax scroll effects.
 */
export interface ParallaxConfig {
  /** Element to apply parallax to */
  element: HTMLElement;
  /** Speed multiplier (0.5 = half speed, 2 = double speed) */
  speed?: number;
  /** Direction of parallax */
  direction?: 'vertical' | 'horizontal';
  /** Trigger element (defaults to element itself) */
  trigger?: HTMLElement;
}

/**
 * Creates a parallax scroll effect on an element.
 */
export function createParallax(config: ParallaxConfig): gsap.core.Tween {
  const {
    element,
    speed = 0.5,
    direction = 'vertical',
    trigger = element,
  } = config;

  const distance = 100 * speed;
  const prop = direction === 'vertical' ? 'y' : 'x';

  return gsap.to(element, {
    [prop]: -distance,
    ease: 'none',
    scrollTrigger: {
      trigger,
      start: 'top bottom',
      end: 'bottom top',
      scrub: true,
    },
  });
}

/**
 * Creates a reveal-on-scroll animation.
 */
export function createScrollReveal(
  element: HTMLElement,
  options: {
    from?: gsap.TweenVars;
    to?: gsap.TweenVars;
    start?: string;
    markers?: boolean;
  } = {}
): gsap.core.Tween {
  const {
    from = { opacity: 0, y: 50 },
    to = { opacity: 1, y: 0 },
    start = 'top 80%',
    markers = false,
  } = options;

  gsap.set(element, from);

  return gsap.to(element, {
    ...to,
    duration: 0.8,
    ease: GSAP_EASINGS.smooth,
    scrollTrigger: {
      trigger: element,
      start,
      toggleActions: 'play none none reverse',
      markers,
    },
  });
}

/**
 * Creates staggered reveal for multiple elements on scroll.
 */
export function createStaggeredScrollReveal(
  elements: HTMLElement[],
  options: {
    stagger?: number;
    from?: gsap.TweenVars;
    to?: gsap.TweenVars;
    start?: string;
  } = {}
): gsap.core.Tween {
  const {
    stagger = 0.1,
    from = { opacity: 0, y: 30 },
    to = { opacity: 1, y: 0 },
    start = 'top 80%',
  } = options;

  gsap.set(elements, from);

  return gsap.to(elements, {
    ...to,
    duration: 0.6,
    stagger,
    ease: GSAP_EASINGS.smooth,
    scrollTrigger: {
      trigger: elements[0],
      start,
      toggleActions: 'play none none reverse',
    },
  });
}

/**
 * Creates a horizontal scroll section.
 */
export function createHorizontalScroll(
  container: HTMLElement,
  scrollContent: HTMLElement
): gsap.core.Tween {
  const scrollWidth = scrollContent.scrollWidth - container.offsetWidth;

  return gsap.to(scrollContent, {
    x: -scrollWidth,
    ease: 'none',
    scrollTrigger: {
      trigger: container,
      start: 'top top',
      end: `+=${scrollWidth}`,
      scrub: 1,
      pin: true,
      anticipatePin: 1,
    },
  });
}

/**
 * Creates a progress indicator tied to scroll position.
 */
export function createScrollProgress(
  progressBar: HTMLElement,
  options: {
    trigger?: HTMLElement;
    start?: string;
    end?: string;
  } = {}
): gsap.core.Tween {
  const {
    trigger = document.documentElement,
    start = 'top top',
    end = 'bottom bottom',
  } = options;

  return gsap.to(progressBar, {
    scaleX: 1,
    transformOrigin: 'left center',
    ease: 'none',
    scrollTrigger: {
      trigger,
      start,
      end,
      scrub: 0.3,
    },
  });
}
