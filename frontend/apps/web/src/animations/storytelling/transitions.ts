import gsap from 'gsap';
import { DURATIONS } from '../constants';
import { GSAP_EASINGS } from '../constants/easings';

/**
 * Cinematic fade to black transition.
 */
export function createFadeToBlack(
  overlay: HTMLElement,
  duration: number = DURATIONS.slow
): gsap.core.Timeline {
  const tl = gsap.timeline();

  tl.fromTo(
    overlay,
    { opacity: 0, display: 'block' },
    { opacity: 1, duration }
  );

  return tl;
}

/**
 * Cinematic fade from black transition.
 */
export function createFadeFromBlack(
  overlay: HTMLElement,
  duration: number = DURATIONS.slow
): gsap.core.Timeline {
  const tl = gsap.timeline();

  tl.fromTo(
    overlay,
    { opacity: 1 },
    { opacity: 0, duration }
  ).set(overlay, { display: 'none' });

  return tl;
}

/**
 * Wipe transition (horizontal or vertical).
 */
export function createWipeTransition(
  element: HTMLElement,
  direction: 'left' | 'right' | 'up' | 'down' = 'right',
  duration: number = DURATIONS.medium
): gsap.core.Timeline {
  const tl = gsap.timeline();
  const isHorizontal = direction === 'left' || direction === 'right';
  const isReverse = direction === 'left' || direction === 'up';

  const prop = isHorizontal ? 'scaleX' : 'scaleY';
  const origin = isHorizontal
    ? isReverse
      ? 'right center'
      : 'left center'
    : isReverse
    ? 'center bottom'
    : 'center top';

  tl.fromTo(
    element,
    {
      [prop]: 0,
      transformOrigin: origin,
    },
    {
      [prop]: 1,
      duration,
      ease: GSAP_EASINGS.smooth,
    }
  );

  return tl;
}

/**
 * Zoom in transition.
 */
export function createZoomIn(
  element: HTMLElement,
  duration: number = DURATIONS.medium
): gsap.core.Timeline {
  const tl = gsap.timeline();

  tl.fromTo(
    element,
    {
      scale: 0.5,
      opacity: 0,
    },
    {
      scale: 1,
      opacity: 1,
      duration,
      ease: GSAP_EASINGS.back,
    }
  );

  return tl;
}

/**
 * Zoom out transition.
 */
export function createZoomOut(
  element: HTMLElement,
  duration: number = DURATIONS.medium
): gsap.core.Timeline {
  const tl = gsap.timeline();

  tl.to(element, {
    scale: 1.5,
    opacity: 0,
    duration,
    ease: GSAP_EASINGS.smooth,
  });

  return tl;
}

/**
 * Blur in transition.
 */
export function createBlurIn(
  element: HTMLElement,
  duration: number = DURATIONS.medium
): gsap.core.Timeline {
  const tl = gsap.timeline();

  tl.fromTo(
    element,
    {
      filter: 'blur(20px)',
      opacity: 0,
    },
    {
      filter: 'blur(0px)',
      opacity: 1,
      duration,
      ease: GSAP_EASINGS.smooth,
    }
  );

  return tl;
}

/**
 * Blur out transition.
 */
export function createBlurOut(
  element: HTMLElement,
  duration: number = DURATIONS.medium
): gsap.core.Timeline {
  const tl = gsap.timeline();

  tl.to(element, {
    filter: 'blur(20px)',
    opacity: 0,
    duration,
    ease: GSAP_EASINGS.smooth,
  });

  return tl;
}

/**
 * Cross-dissolve between two elements.
 */
export function createCrossDissolve(
  fromElement: HTMLElement,
  toElement: HTMLElement,
  duration: number = DURATIONS.slow
): gsap.core.Timeline {
  const tl = gsap.timeline();

  // Set initial states
  gsap.set(toElement, { opacity: 0 });

  tl.to(fromElement, {
    opacity: 0,
    duration,
    ease: GSAP_EASINGS.smooth,
  });

  tl.to(
    toElement,
    {
      opacity: 1,
      duration,
      ease: GSAP_EASINGS.smooth,
    },
    0 // Start at same time
  );

  return tl;
}

/**
 * Cosmic portal transition (circle wipe).
 */
export function createPortalTransition(
  portalElement: HTMLElement,
  duration: number = DURATIONS.slower
): gsap.core.Timeline {
  const tl = gsap.timeline();

  gsap.set(portalElement, {
    clipPath: 'circle(0% at 50% 50%)',
    opacity: 1,
  });

  tl.to(portalElement, {
    clipPath: 'circle(100% at 50% 50%)',
    duration,
    ease: GSAP_EASINGS.smooth,
  });

  return tl;
}

/**
 * Star burst reveal transition.
 */
export function createStarBurstReveal(
  elements: HTMLElement[],
  centerX: number,
  centerY: number
): gsap.core.Timeline {
  const tl = gsap.timeline();

  // Position elements at center
  gsap.set(elements, {
    x: centerX,
    y: centerY,
    scale: 0,
    opacity: 0,
  });

  // Burst outward
  elements.forEach((element, index) => {
    const angle = (index / elements.length) * Math.PI * 2;
    const distance = 100 + Math.random() * 100;
    const targetX = centerX + Math.cos(angle) * distance;
    const targetY = centerY + Math.sin(angle) * distance;

    tl.to(
      element,
      {
        x: targetX,
        y: targetY,
        scale: 1,
        opacity: 1,
        duration: DURATIONS.slow,
        ease: GSAP_EASINGS.back,
      },
      0.05 * index
    );
  });

  return tl;
}

/**
 * Scene transition with shared element.
 */
export function createSharedElementTransition(
  sharedElement: HTMLElement,
  targetRect: { x: number; y: number; width: number; height: number }
): gsap.core.Timeline {
  const currentRect = sharedElement.getBoundingClientRect();

  const tl = gsap.timeline();

  tl.to(sharedElement, {
    x: `+=${targetRect.x - currentRect.x}`,
    y: `+=${targetRect.y - currentRect.y}`,
    width: targetRect.width,
    height: targetRect.height,
    duration: DURATIONS.medium,
    ease: GSAP_EASINGS.smooth,
  });

  return tl;
}
