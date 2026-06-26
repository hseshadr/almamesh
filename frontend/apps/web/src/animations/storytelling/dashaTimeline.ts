import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { GSAP_EASINGS } from '../constants/easings';

gsap.registerPlugin(ScrollTrigger);

/**
 * Dasha period configuration.
 */
export interface DashaPeriod {
  /** DOM element for this period */
  element: HTMLElement;
  /** Planet name (Sun, Moon, Mars, etc.) */
  planet: string;
  /** Color associated with the planet */
  color: string;
  /** Start year of the period */
  startYear: number;
  /** End year of the period */
  endYear: number;
  /** Whether this is a sub-period (Bhukti) */
  isSubPeriod?: boolean;
}

/**
 * Configuration for Dasha timeline visualization.
 */
export interface DashaTimelineConfig {
  /** Container element */
  container: HTMLElement;
  /** Array of Dasha periods */
  periods: DashaPeriod[];
  /** Current year for highlighting */
  currentYear: number;
  /** Optional callback when period is focused */
  onPeriodFocus?: (period: DashaPeriod, index: number) => void;
  /** Whether to use scroll-driven animation */
  scrollDriven?: boolean;
}

/**
 * Creates the Dasha timeline visualization animation.
 * Shows planetary periods as animated segments with current period highlighted.
 *
 * @example
 * ```tsx
 * function DashaVisualization({ periods, currentYear }) {
 *   const containerRef = useRef<HTMLDivElement>(null);
 *
 *   useGSAP(() => {
 *     if (!containerRef.current) return;
 *
 *     const periodElements = Array.from(
 *       containerRef.current.querySelectorAll('.dasha-period')
 *     );
 *
 *     const config: DashaTimelineConfig = {
 *       container: containerRef.current,
 *       periods: periods.map((p, i) => ({
 *         element: periodElements[i],
 *         planet: p.planet,
 *         color: p.color,
 *         startYear: p.startYear,
 *         endYear: p.endYear,
 *       })),
 *       currentYear,
 *       scrollDriven: true,
 *     };
 *
 *     createDashaTimeline(config);
 *   }, [periods, currentYear]);
 *
 *   return (
 *     <div ref={containerRef} className="dasha-container">
 *       {periods.map((period, i) => (
 *         <div
 *           key={i}
 *           className="dasha-period"
 *           style={{ backgroundColor: period.color }}
 *         >
 *           {period.planet}
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function createDashaTimeline(
  config: DashaTimelineConfig
): gsap.core.Timeline {
  const {
    container,
    periods,
    currentYear,
    onPeriodFocus,
    scrollDriven = false,
  } = config;

  const timelineOptions: gsap.TimelineVars = scrollDriven
    ? {
        scrollTrigger: {
          trigger: container,
          start: 'top center',
          end: 'bottom center',
          scrub: 0.5,
        },
      }
    : {};

  const tl = gsap.timeline(timelineOptions);

  periods.forEach((period, index) => {
    const isPast = period.endYear < currentYear;
    const isCurrent =
      period.startYear <= currentYear && period.endYear >= currentYear;

    // Set initial state
    gsap.set(period.element, {
      scaleX: 0,
      opacity: 0,
      transformOrigin: 'left center',
    });

    // Draw the period segment
    tl.to(
      period.element,
      {
        scaleX: 1,
        opacity: isPast ? 0.5 : 1,
        duration: 1,
        ease: GSAP_EASINGS.smooth,
      },
      index * 0.1
    );

    // Highlight current period
    if (isCurrent) {
      tl.to(
        period.element,
        {
          boxShadow: `0 0 20px ${period.color}`,
          duration: 0.5,
        },
        '<+=0.5'
      );

      // Add pulsing effect for current period
      gsap.to(period.element, {
        keyframes: [
          { boxShadow: `0 0 10px ${period.color}` },
          { boxShadow: `0 0 25px ${period.color}` },
          { boxShadow: `0 0 10px ${period.color}` },
        ],
        repeat: -1,
        duration: 2,
        ease: 'sine.inOut',
      });
    }

    // Add hover interaction
    period.element.addEventListener('mouseenter', () => {
      if (!isCurrent) {
        gsap.to(period.element, {
          scale: 1.05,
          boxShadow: `0 0 15px ${period.color}`,
          duration: 0.3,
        });
      }
      onPeriodFocus?.(period, index);
    });

    period.element.addEventListener('mouseleave', () => {
      if (!isCurrent) {
        gsap.to(period.element, {
          scale: 1,
          boxShadow: 'none',
          duration: 0.3,
        });
      }
    });
  });

  return tl;
}

/**
 * Creates a circular Dasha wheel animation.
 * Periods are displayed as segments of a circle.
 */
export function createDashaWheel(
  _container: HTMLElement,
  periods: DashaPeriod[],
  currentYear: number
): gsap.core.Timeline {
  const tl = gsap.timeline();
  const totalDegrees = 360;
  let currentDegree = 0;

  periods.forEach((period, index) => {
    const periodDuration = period.endYear - period.startYear;
    const totalDuration = periods.reduce(
      (sum, p) => sum + (p.endYear - p.startYear),
      0
    );
    const degrees = (periodDuration / totalDuration) * totalDegrees;

    const isCurrent =
      period.startYear <= currentYear && period.endYear >= currentYear;

    // Animate segment appearing
    tl.fromTo(
      period.element,
      {
        opacity: 0,
        scale: 0.8,
        rotation: currentDegree - 10,
      },
      {
        opacity: isCurrent ? 1 : 0.7,
        scale: 1,
        rotation: currentDegree,
        duration: 0.5,
        ease: GSAP_EASINGS.back,
      },
      index * 0.1
    );

    currentDegree += degrees;
  });

  return tl;
}

/**
 * Creates a vertical timeline with connecting lines.
 */
export function createVerticalDashaTimeline(
  periods: DashaPeriod[],
  lineElement: HTMLElement,
  currentYear: number
): gsap.core.Timeline {
  const tl = gsap.timeline();

  // Animate the connecting line
  tl.fromTo(
    lineElement,
    { scaleY: 0, transformOrigin: 'top center' },
    { scaleY: 1, duration: 1, ease: GSAP_EASINGS.smooth }
  );

  // Animate each period node
  periods.forEach((period, index) => {
    const isCurrent =
      period.startYear <= currentYear && period.endYear >= currentYear;

    tl.fromTo(
      period.element,
      {
        opacity: 0,
        x: index % 2 === 0 ? -30 : 30,
        scale: 0.8,
      },
      {
        opacity: 1,
        x: 0,
        scale: isCurrent ? 1.1 : 1,
        duration: 0.4,
        ease: GSAP_EASINGS.back,
      },
      0.2 + index * 0.15
    );
  });

  return tl;
}

/**
 * Animates transition between Dasha periods.
 */
export function animatePeriodTransition(
  fromPeriod: HTMLElement,
  toPeriod: HTMLElement,
  color: string
): gsap.core.Timeline {
  const tl = gsap.timeline();

  // Fade out old period
  tl.to(fromPeriod, {
    opacity: 0.5,
    scale: 0.95,
    boxShadow: 'none',
    duration: 0.4,
  });

  // Highlight new period
  tl.to(
    toPeriod,
    {
      opacity: 1,
      scale: 1.05,
      boxShadow: `0 0 25px ${color}`,
      duration: 0.5,
      ease: GSAP_EASINGS.back,
    },
    '-=0.2'
  );

  // Settle new period
  tl.to(toPeriod, {
    scale: 1,
    duration: 0.3,
  });

  return tl;
}
