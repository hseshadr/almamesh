import gsap from 'gsap';
import { GSAP_EASINGS } from '../constants/easings';

/**
 * Planet configuration for orbital animation.
 */
export interface PlanetConfig {
  /** DOM element representing the planet */
  element: HTMLElement;
  /** Planet identifier */
  name: string;
  /** Orbit radius in pixels */
  orbitRadius: number;
  /** Orbital period in seconds */
  period: number;
  /** Starting angle in degrees */
  startAngle?: number;
  /** Orbit color for path */
  orbitColor?: string;
  /** Whether orbit is retrograde */
  retrograde?: boolean;
}

/**
 * Creates a simple circular orbit animation for a planet.
 *
 * @example
 * ```tsx
 * function PlanetVisualization() {
 *   const planetRef = useRef<HTMLDivElement>(null);
 *
 *   useGSAP(() => {
 *     if (!planetRef.current) return;
 *
 *     createOrbitAnimation({
 *       element: planetRef.current,
 *       name: 'Mars',
 *       orbitRadius: 150,
 *       period: 10,
 *     });
 *   }, []);
 *
 *   return (
 *     <div className="orbit-container">
 *       <div ref={planetRef} className="planet mars" />
 *     </div>
 *   );
 * }
 * ```
 */
export function createOrbitAnimation(
  config: PlanetConfig
): gsap.core.Timeline {
  const {
    element,
    orbitRadius,
    period,
    startAngle = 0,
    retrograde = false,
  } = config;

  // Position element at starting point
  const startRad = (startAngle * Math.PI) / 180;
  gsap.set(element, {
    x: Math.cos(startRad) * orbitRadius,
    y: Math.sin(startRad) * orbitRadius,
  });

  const tl = gsap.timeline({ repeat: -1 });

  // Animate around the orbit
  tl.to(element, {
    duration: period,
    ease: 'none',
    motionPath: {
      path: [
        { x: Math.cos(startRad) * orbitRadius, y: Math.sin(startRad) * orbitRadius },
        { x: Math.cos(startRad + Math.PI / 2) * orbitRadius, y: Math.sin(startRad + Math.PI / 2) * orbitRadius },
        { x: Math.cos(startRad + Math.PI) * orbitRadius, y: Math.sin(startRad + Math.PI) * orbitRadius },
        { x: Math.cos(startRad + (3 * Math.PI) / 2) * orbitRadius, y: Math.sin(startRad + (3 * Math.PI) / 2) * orbitRadius },
        { x: Math.cos(startRad) * orbitRadius, y: Math.sin(startRad) * orbitRadius },
      ],
      curviness: 1,
    },
  });

  // Reverse if retrograde
  if (retrograde) {
    tl.reversed(true);
  }

  return tl;
}

/**
 * Alternative orbit using rotation (simpler, better performance).
 */
export function createSimpleOrbitAnimation(
  element: HTMLElement,
  orbitRadius: number,
  period: number,
  retrograde: boolean = false
): gsap.core.Tween {
  // Set the element at the orbit radius
  gsap.set(element, {
    x: orbitRadius,
    y: 0,
    transformOrigin: `-${orbitRadius}px center`,
  });

  return gsap.to(element, {
    rotation: retrograde ? -360 : 360,
    duration: period,
    ease: 'none',
    repeat: -1,
  });
}

/**
 * Creates multiple orbiting planets.
 */
export function createSolarSystemAnimation(
  planets: PlanetConfig[],
  centerElement?: HTMLElement
): gsap.core.Timeline {
  const tl = gsap.timeline();

  // Animate center (Sun) if provided
  if (centerElement) {
    tl.fromTo(
      centerElement,
      { scale: 0, opacity: 0 },
      {
        scale: 1,
        opacity: 1,
        duration: 0.8,
        ease: GSAP_EASINGS.back,
      }
    );
  }

  // Add each planet's orbit
  planets.forEach((planet, index) => {
    // Fade in planet
    tl.fromTo(
      planet.element,
      { opacity: 0, scale: 0 },
      {
        opacity: 1,
        scale: 1,
        duration: 0.4,
        ease: GSAP_EASINGS.back,
      },
      0.3 + index * 0.1
    );

    // Start orbital animation
    createSimpleOrbitAnimation(
      planet.element,
      planet.orbitRadius,
      planet.period,
      planet.retrograde
    );
  });

  return tl;
}

/**
 * Creates a pulsing glow effect for planets.
 */
export function createPlanetGlow(
  element: HTMLElement,
  color: string
): gsap.core.Tween {
  return gsap.to(element, {
    keyframes: [
      { boxShadow: `0 0 10px ${color}` },
      { boxShadow: `0 0 25px ${color}` },
      { boxShadow: `0 0 10px ${color}` },
    ],
    repeat: -1,
    duration: 2,
    ease: 'sine.inOut',
  });
}

/**
 * Animates a planet to a specific position (e.g., for aspect visualization).
 */
export function animatePlanetToPosition(
  element: HTMLElement,
  targetX: number,
  targetY: number,
  duration: number = 1
): gsap.core.Tween {
  return gsap.to(element, {
    x: targetX,
    y: targetY,
    duration,
    ease: GSAP_EASINGS.smooth,
  });
}

/**
 * Creates a conjunction animation (planets meeting).
 */
export function createConjunctionAnimation(
  planet1: HTMLElement,
  planet2: HTMLElement,
  meetingPoint: { x: number; y: number }
): gsap.core.Timeline {
  const tl = gsap.timeline();

  // Move both planets toward meeting point
  tl.to(
    planet1,
    {
      x: meetingPoint.x - 20,
      y: meetingPoint.y,
      duration: 1,
      ease: GSAP_EASINGS.smooth,
    },
    0
  );

  tl.to(
    planet2,
    {
      x: meetingPoint.x + 20,
      y: meetingPoint.y,
      duration: 1,
      ease: GSAP_EASINGS.smooth,
    },
    0
  );

  // Flash effect at conjunction
  tl.to([planet1, planet2], {
    scale: 1.2,
    duration: 0.3,
    ease: GSAP_EASINGS.elastic,
  });

  tl.to([planet1, planet2], {
    scale: 1,
    duration: 0.2,
  });

  return tl;
}

/**
 * Creates SVG orbit path drawing animation.
 */
export function createOrbitPathDraw(
  pathElement: SVGPathElement,
  duration: number = 2
): gsap.core.Timeline {
  const pathLength = pathElement.getTotalLength();

  gsap.set(pathElement, {
    strokeDasharray: pathLength,
    strokeDashoffset: pathLength,
  });

  const tl = gsap.timeline();

  tl.to(pathElement, {
    strokeDashoffset: 0,
    duration,
    ease: 'power1.inOut',
  });

  return tl;
}
