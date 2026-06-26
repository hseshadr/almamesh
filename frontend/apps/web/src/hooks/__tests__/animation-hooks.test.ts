/**
 * Tests for animation hooks (Spec 032)
 *
 * Tests useReducedMotion, useMediaQuery, useAnimationPerformance, and useScrollReveal hooks.
 * Covers accessibility, responsive behavior, performance optimization, and scroll-reveal animations.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useReducedMotion } from '../useReducedMotion';
import { useMediaQuery } from '../useMediaQuery';
import { useAnimationPerformance } from '../useAnimationPerformance';
import { useScrollReveal } from '../useScrollReveal';

// ============================================================================
// Helper functions for mocking matchMedia
// ============================================================================

interface MockMediaQueryList {
  matches: boolean;
  media: string;
  onchange: ((ev: MediaQueryListEvent) => void) | null;
  addListener: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  dispatchEvent: ReturnType<typeof vi.fn>;
}

type ChangeHandler = (e: MediaQueryListEvent) => void;

/**
 * Creates a mock matchMedia implementation with control over the matches value.
 * Returns a function to trigger change events.
 */
function createMockMatchMedia(initialMatches: boolean) {
  const listeners: Map<string, ChangeHandler[]> = new Map();
  let currentMatches = initialMatches;

  const mockMatchMedia = vi.fn().mockImplementation((query: string): MockMediaQueryList => ({
    matches: currentMatches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((event: string, handler: ChangeHandler) => {
      if (event === 'change') {
        const existing = listeners.get(query) || [];
        existing.push(handler);
        listeners.set(query, existing);
      }
    }),
    removeEventListener: vi.fn((event: string, handler: ChangeHandler) => {
      if (event === 'change') {
        const existing = listeners.get(query) || [];
        listeners.set(
          query,
          existing.filter((h) => h !== handler)
        );
      }
    }),
    dispatchEvent: vi.fn(),
  }));

  const setMatches = (matches: boolean, query?: string) => {
    currentMatches = matches;
    // Trigger change events for all registered listeners
    const targetQueries = query ? [query] : Array.from(listeners.keys());
    for (const q of targetQueries) {
      const handlers = listeners.get(q) || [];
      for (const handler of handlers) {
        handler({ matches, media: q } as MediaQueryListEvent);
      }
    }
  };

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: mockMatchMedia,
  });

  return { mockMatchMedia, setMatches, listeners };
}

/**
 * Simple mock matchMedia that always returns a fixed matches value.
 */
function mockMatchMediaSimple(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// ============================================================================
// useReducedMotion Tests
// ============================================================================

describe('useReducedMotion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Reset matchMedia to default false
    mockMatchMediaSimple(false);
  });

  describe('initial state', () => {
    it('should return false when no preference is set', () => {
      mockMatchMediaSimple(false);
      const { result } = renderHook(() => useReducedMotion());
      expect(result.current).toBe(false);
    });

    it('should return true when prefers-reduced-motion: reduce is set', () => {
      mockMatchMediaSimple(true);
      const { result } = renderHook(() => useReducedMotion());
      expect(result.current).toBe(true);
    });

    it('should query the correct media query string', () => {
      const mockFn = vi.fn().mockReturnValue({
        matches: false,
        media: '',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      });

      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: mockFn,
      });

      renderHook(() => useReducedMotion());

      expect(mockFn).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    });
  });

  describe('dynamic updates', () => {
    it('should update when preference changes from false to true', async () => {
      const { setMatches } = createMockMatchMedia(false);
      const { result } = renderHook(() => useReducedMotion());

      expect(result.current).toBe(false);

      act(() => {
        setMatches(true);
      });

      await waitFor(() => {
        expect(result.current).toBe(true);
      });
    });

    it('should update when preference changes from true to false', async () => {
      const { setMatches } = createMockMatchMedia(true);
      const { result } = renderHook(() => useReducedMotion());

      expect(result.current).toBe(true);

      act(() => {
        setMatches(false);
      });

      await waitFor(() => {
        expect(result.current).toBe(false);
      });
    });

    it('should add and remove event listener on mount/unmount', () => {
      let addEventListenerMock: ReturnType<typeof vi.fn>;
      let removeEventListenerMock: ReturnType<typeof vi.fn>;

      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(() => {
          addEventListenerMock = vi.fn();
          removeEventListenerMock = vi.fn();
          return {
            matches: false,
            media: '',
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: addEventListenerMock,
            removeEventListener: removeEventListenerMock,
            dispatchEvent: vi.fn(),
          };
        }),
      });

      const { unmount } = renderHook(() => useReducedMotion());

      expect(addEventListenerMock!).toHaveBeenCalledWith('change', expect.any(Function));

      unmount();

      expect(removeEventListenerMock!).toHaveBeenCalledWith('change', expect.any(Function));
    });
  });
});

// ============================================================================
// useMediaQuery Tests
// ============================================================================

describe('useMediaQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockMatchMediaSimple(false);
  });

  describe('initial state', () => {
    it('should return true when query matches', () => {
      mockMatchMediaSimple(true);
      const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));
      expect(result.current).toBe(true);
    });

    it('should return false when query does not match', () => {
      mockMatchMediaSimple(false);
      const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));
      expect(result.current).toBe(false);
    });

    it('should pass the correct query to matchMedia', () => {
      const mockFn = vi.fn().mockReturnValue({
        matches: false,
        media: '',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      });

      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: mockFn,
      });

      renderHook(() => useMediaQuery('(min-width: 1024px)'));

      expect(mockFn).toHaveBeenCalledWith('(min-width: 1024px)');
    });
  });

  describe('different query types', () => {
    it('should work with max-width queries', () => {
      mockMatchMediaSimple(true);
      const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));
      expect(result.current).toBe(true);
    });

    it('should work with min-width queries', () => {
      mockMatchMediaSimple(true);
      const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'));
      expect(result.current).toBe(true);
    });

    it('should work with prefers-color-scheme queries', () => {
      mockMatchMediaSimple(true);
      const { result } = renderHook(() => useMediaQuery('(prefers-color-scheme: dark)'));
      expect(result.current).toBe(true);
    });

    it('should work with combined queries', () => {
      mockMatchMediaSimple(true);
      const { result } = renderHook(() =>
        useMediaQuery('(min-width: 768px) and (max-width: 1024px)')
      );
      expect(result.current).toBe(true);
    });
  });

  describe('dynamic updates', () => {
    it('should update when window resizes and query match changes', async () => {
      const { setMatches } = createMockMatchMedia(false);
      const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));

      expect(result.current).toBe(false);

      act(() => {
        setMatches(true);
      });

      await waitFor(() => {
        expect(result.current).toBe(true);
      });
    });

    it('should update when query match changes to false', async () => {
      const { setMatches } = createMockMatchMedia(true);
      const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));

      expect(result.current).toBe(true);

      act(() => {
        setMatches(false);
      });

      await waitFor(() => {
        expect(result.current).toBe(false);
      });
    });
  });

  describe('query changes', () => {
    it('should update listener when query prop changes', () => {
      const addEventListenerMock = vi.fn();
      const removeEventListenerMock = vi.fn();

      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(() => ({
          matches: false,
          media: '',
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: addEventListenerMock,
          removeEventListener: removeEventListenerMock,
          dispatchEvent: vi.fn(),
        })),
      });

      const { rerender } = renderHook(({ query }) => useMediaQuery(query), {
        initialProps: { query: '(max-width: 768px)' },
      });

      expect(addEventListenerMock).toHaveBeenCalledTimes(1);

      rerender({ query: '(min-width: 1024px)' });

      // Should have removed the old listener and added a new one
      expect(removeEventListenerMock).toHaveBeenCalledTimes(1);
      expect(addEventListenerMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('SSR handling', () => {
    it('should return false initially for SSR safety', () => {
      // The hook handles SSR by checking typeof window === 'undefined'
      // In happy-dom, window exists, so we test the else branch
      mockMatchMediaSimple(false);
      const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));
      expect(result.current).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should remove event listener on unmount', () => {
      const removeEventListenerMock = vi.fn();

      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(() => ({
          matches: false,
          media: '',
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: removeEventListenerMock,
          dispatchEvent: vi.fn(),
        })),
      });

      const { unmount } = renderHook(() => useMediaQuery('(max-width: 768px)'));

      unmount();

      expect(removeEventListenerMock).toHaveBeenCalledWith('change', expect.any(Function));
    });
  });
});

// ============================================================================
// useAnimationPerformance Tests
// ============================================================================

describe('useAnimationPerformance', () => {
  const originalInnerWidth = window.innerWidth;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMatchMediaSimple(false);
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1200, // Desktop default
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    });
  });

  describe('shouldAnimate based on reduced motion', () => {
    it('should return shouldAnimate: true when reduced motion is not preferred', () => {
      mockMatchMediaSimple(false);
      const { result } = renderHook(() => useAnimationPerformance());
      expect(result.current.shouldAnimate).toBe(true);
    });

    it('should return shouldAnimate: false when reduced motion is preferred', () => {
      mockMatchMediaSimple(true);
      const { result } = renderHook(() => useAnimationPerformance());
      expect(result.current.shouldAnimate).toBe(false);
    });
  });

  describe('particleCount for device types', () => {
    it('should return full particle count (50) for desktop', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1200, writable: true });
      mockMatchMediaSimple(false);
      const { result } = renderHook(() => useAnimationPerformance());
      // Desktop has elementMultiplier of 1.0, so 50 * 1.0 = 50
      expect(result.current.particleCount).toBe(50);
      expect(result.current.deviceType).toBe('desktop');
    });

    it('should return reduced particle count (35) for tablet', () => {
      Object.defineProperty(window, 'innerWidth', { value: 900, writable: true });
      mockMatchMediaSimple(false);
      const { result } = renderHook(() => useAnimationPerformance());
      // Tablet has elementMultiplier of 0.7, so 50 * 0.7 = 35
      expect(result.current.particleCount).toBe(35);
      expect(result.current.deviceType).toBe('tablet');
    });

    it('should return minimal particle count (20) for mobile', () => {
      Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });
      mockMatchMediaSimple(false);
      const { result } = renderHook(() => useAnimationPerformance());
      // Mobile has elementMultiplier of 0.4, so 50 * 0.4 = 20
      expect(result.current.particleCount).toBe(20);
      expect(result.current.deviceType).toBe('mobile');
    });
  });

  describe('deviceType classification', () => {
    it('should classify width <= 768 as mobile', () => {
      Object.defineProperty(window, 'innerWidth', { value: 768, writable: true });
      mockMatchMediaSimple(false);
      const { result } = renderHook(() => useAnimationPerformance());
      expect(result.current.deviceType).toBe('mobile');
    });

    it('should classify width 769-1024 as tablet', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
      mockMatchMediaSimple(false);
      const { result } = renderHook(() => useAnimationPerformance());
      expect(result.current.deviceType).toBe('tablet');
    });

    it('should classify width > 1024 as desktop', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1025, writable: true });
      mockMatchMediaSimple(false);
      const { result } = renderHook(() => useAnimationPerformance());
      expect(result.current.deviceType).toBe('desktop');
    });
  });

  describe('enableParallax', () => {
    it('should enable parallax on desktop when reduced motion is not preferred', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1200, writable: true });
      mockMatchMediaSimple(false);
      const { result } = renderHook(() => useAnimationPerformance());
      expect(result.current.enableParallax).toBe(true);
    });

    it('should disable parallax on mobile', () => {
      Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });
      mockMatchMediaSimple(false);
      const { result } = renderHook(() => useAnimationPerformance());
      expect(result.current.enableParallax).toBe(false);
    });

    it('should disable parallax when reduced motion is preferred', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1200, writable: true });
      mockMatchMediaSimple(true);
      const { result } = renderHook(() => useAnimationPerformance());
      expect(result.current.enableParallax).toBe(false);
    });
  });

  describe('reduceComplexity', () => {
    it('should not reduce complexity on desktop without reduced motion', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1200, writable: true });
      mockMatchMediaSimple(false);
      const { result } = renderHook(() => useAnimationPerformance());
      expect(result.current.reduceComplexity).toBe(false);
    });

    it('should reduce complexity on mobile', () => {
      Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });
      mockMatchMediaSimple(false);
      const { result } = renderHook(() => useAnimationPerformance());
      expect(result.current.reduceComplexity).toBe(true);
    });

    it('should reduce complexity when reduced motion is preferred', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1200, writable: true });
      mockMatchMediaSimple(true);
      const { result } = renderHook(() => useAnimationPerformance());
      expect(result.current.reduceComplexity).toBe(true);
    });
  });

  describe('breakpoint configuration', () => {
    it('should return correct breakpoint for mobile', () => {
      Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });
      mockMatchMediaSimple(false);
      const { result } = renderHook(() => useAnimationPerformance());
      expect(result.current.breakpoint).toEqual({
        maxWidth: 768,
        reduceComplexity: true,
        disableParallax: true,
        elementMultiplier: 0.4,
      });
    });

    it('should return correct breakpoint for tablet', () => {
      Object.defineProperty(window, 'innerWidth', { value: 900, writable: true });
      mockMatchMediaSimple(false);
      const { result } = renderHook(() => useAnimationPerformance());
      expect(result.current.breakpoint).toEqual({
        maxWidth: 1024,
        reduceComplexity: false,
        disableParallax: false,
        elementMultiplier: 0.7,
      });
    });

    it('should return correct breakpoint for desktop', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1200, writable: true });
      mockMatchMediaSimple(false);
      const { result } = renderHook(() => useAnimationPerformance());
      expect(result.current.breakpoint).toEqual({
        maxWidth: Infinity,
        reduceComplexity: false,
        disableParallax: false,
        elementMultiplier: 1.0,
      });
    });
  });

  describe('elementMultiplier', () => {
    it('should return 0.4 for mobile', () => {
      Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });
      mockMatchMediaSimple(false);
      const { result } = renderHook(() => useAnimationPerformance());
      expect(result.current.elementMultiplier).toBe(0.4);
    });

    it('should return 0.7 for tablet', () => {
      Object.defineProperty(window, 'innerWidth', { value: 900, writable: true });
      mockMatchMediaSimple(false);
      const { result } = renderHook(() => useAnimationPerformance());
      expect(result.current.elementMultiplier).toBe(0.7);
    });

    it('should return 1.0 for desktop', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1200, writable: true });
      mockMatchMediaSimple(false);
      const { result } = renderHook(() => useAnimationPerformance());
      expect(result.current.elementMultiplier).toBe(1.0);
    });
  });

  describe('resize handling', () => {
    it('should update when window is resized', async () => {
      Object.defineProperty(window, 'innerWidth', { value: 1200, writable: true });
      mockMatchMediaSimple(false);
      const { result } = renderHook(() => useAnimationPerformance());

      expect(result.current.deviceType).toBe('desktop');

      act(() => {
        Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });
        window.dispatchEvent(new Event('resize'));
      });

      await waitFor(() => {
        expect(result.current.deviceType).toBe('mobile');
      });
    });

    it('should update particle count on resize', async () => {
      Object.defineProperty(window, 'innerWidth', { value: 1200, writable: true });
      mockMatchMediaSimple(false);
      const { result } = renderHook(() => useAnimationPerformance());

      expect(result.current.particleCount).toBe(50);

      act(() => {
        Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });
        window.dispatchEvent(new Event('resize'));
      });

      await waitFor(() => {
        expect(result.current.particleCount).toBe(20);
      });
    });
  });

  describe('cleanup', () => {
    it('should remove resize event listener on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      mockMatchMediaSimple(false);
      const { unmount } = renderHook(() => useAnimationPerformance());

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
      removeEventListenerSpy.mockRestore();
    });
  });

  describe('edge cases', () => {
    it('should handle boundary width of 768 (mobile edge)', () => {
      Object.defineProperty(window, 'innerWidth', { value: 768, writable: true });
      mockMatchMediaSimple(false);
      const { result } = renderHook(() => useAnimationPerformance());
      expect(result.current.deviceType).toBe('mobile');
      expect(result.current.particleCount).toBe(20);
    });

    it('should handle boundary width of 1024 (tablet edge)', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
      mockMatchMediaSimple(false);
      const { result } = renderHook(() => useAnimationPerformance());
      expect(result.current.deviceType).toBe('tablet');
      expect(result.current.particleCount).toBe(35);
    });

    it('should handle very small width', () => {
      Object.defineProperty(window, 'innerWidth', { value: 320, writable: true });
      mockMatchMediaSimple(false);
      const { result } = renderHook(() => useAnimationPerformance());
      expect(result.current.deviceType).toBe('mobile');
      expect(result.current.particleCount).toBe(20);
    });

    it('should handle very large width', () => {
      Object.defineProperty(window, 'innerWidth', { value: 3840, writable: true });
      mockMatchMediaSimple(false);
      const { result } = renderHook(() => useAnimationPerformance());
      expect(result.current.deviceType).toBe('desktop');
      expect(result.current.particleCount).toBe(50);
    });
  });
});

// ============================================================================
// useScrollReveal Tests
// ============================================================================

describe('useScrollReveal', () => {
  let observeCallback: ((entries: IntersectionObserverEntry[]) => void) | null = null;
  let observedElements: Set<Element>;
  let observeMock: ReturnType<typeof vi.fn> = vi.fn();
  let unobserveMock: ReturnType<typeof vi.fn> = vi.fn();
  let disconnectMock: ReturnType<typeof vi.fn> = vi.fn();
  let constructorCallCount: number;
  let lastOptions: IntersectionObserverInit | undefined;

  // Mock IntersectionObserver as a class
  class MockIntersectionObserver implements IntersectionObserver {
    readonly root: Element | Document | null;
    readonly rootMargin: string;
    readonly thresholds: ReadonlyArray<number>;

    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      constructorCallCount++;
      lastOptions = options;
      observeCallback = callback as (entries: IntersectionObserverEntry[]) => void;
      this.root = options?.root || null;
      this.rootMargin = options?.rootMargin || '0px';
      this.thresholds = options?.threshold
        ? Array.isArray(options.threshold)
          ? options.threshold
          : [options.threshold]
        : [0];
    }

    observe(target: Element): void {
      (observeMock as (target: Element) => void)(target);
      observedElements.add(target);
    }

    unobserve(target: Element): void {
      (unobserveMock as (target: Element) => void)(target);
      observedElements.delete(target);
    }

    disconnect(): void {
      (disconnectMock as () => void)();
      observedElements.clear();
    }

    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  beforeEach(() => {
    vi.clearAllMocks();
    observedElements = new Set();
    observeMock = vi.fn();
    unobserveMock = vi.fn();
    disconnectMock = vi.fn();
    constructorCallCount = 0;
    lastOptions = undefined;
    observeCallback = null;

    Object.defineProperty(window, 'IntersectionObserver', {
      writable: true,
      configurable: true,
      value: MockIntersectionObserver,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    observeCallback = null;
  });

  describe('initial state', () => {
    it('should return isVisible: false initially', () => {
      const { result } = renderHook(() => useScrollReveal());
      expect(result.current.isVisible).toBe(false);
    });

    it('should provide a valid elementRef', () => {
      const { result } = renderHook(() => useScrollReveal());
      expect(result.current.elementRef).toBeDefined();
      expect(result.current.elementRef.current).toBe(null);
    });
  });

  describe('visibility detection', () => {
    it('should set isVisible: true when element enters viewport', async () => {
      const { result } = renderHook(() => useScrollReveal());

      // Simulate element entering viewport
      act(() => {
        if (observeCallback) {
          observeCallback([
            {
              isIntersecting: true,
              target: document.createElement('div'),
              boundingClientRect: {} as DOMRectReadOnly,
              intersectionRatio: 0.5,
              intersectionRect: {} as DOMRectReadOnly,
              rootBounds: null,
              time: Date.now(),
            },
          ]);
        }
      });

      await waitFor(() => {
        expect(result.current.isVisible).toBe(true);
      });
    });

    it('should remain visible when triggerOnce is true (default)', async () => {
      const { result } = renderHook(() => useScrollReveal({ triggerOnce: true }));

      // Element enters viewport
      act(() => {
        if (observeCallback) {
          observeCallback([
            {
              isIntersecting: true,
              target: document.createElement('div'),
              boundingClientRect: {} as DOMRectReadOnly,
              intersectionRatio: 0.5,
              intersectionRect: {} as DOMRectReadOnly,
              rootBounds: null,
              time: Date.now(),
            },
          ]);
        }
      });

      expect(result.current.isVisible).toBe(true);

      // Element leaves viewport
      act(() => {
        if (observeCallback) {
          observeCallback([
            {
              isIntersecting: false,
              target: document.createElement('div'),
              boundingClientRect: {} as DOMRectReadOnly,
              intersectionRatio: 0,
              intersectionRect: {} as DOMRectReadOnly,
              rootBounds: null,
              time: Date.now(),
            },
          ]);
        }
      });

      // Should still be visible since triggerOnce is true
      expect(result.current.isVisible).toBe(true);
    });

    it('should toggle visibility when triggerOnce is false', async () => {
      const { result } = renderHook(() => useScrollReveal({ triggerOnce: false }));

      // Element enters viewport
      act(() => {
        if (observeCallback) {
          observeCallback([
            {
              isIntersecting: true,
              target: document.createElement('div'),
              boundingClientRect: {} as DOMRectReadOnly,
              intersectionRatio: 0.5,
              intersectionRect: {} as DOMRectReadOnly,
              rootBounds: null,
              time: Date.now(),
            },
          ]);
        }
      });

      expect(result.current.isVisible).toBe(true);

      // Element leaves viewport
      act(() => {
        if (observeCallback) {
          observeCallback([
            {
              isIntersecting: false,
              target: document.createElement('div'),
              boundingClientRect: {} as DOMRectReadOnly,
              intersectionRatio: 0,
              intersectionRect: {} as DOMRectReadOnly,
              rootBounds: null,
              time: Date.now(),
            },
          ]);
        }
      });

      expect(result.current.isVisible).toBe(false);
    });
  });

  describe('options configuration', () => {
    it('should use default threshold of 0.1', () => {
      renderHook(() => useScrollReveal());
      expect(lastOptions).toEqual(
        expect.objectContaining({ threshold: 0.1 })
      );
    });

    it('should use custom threshold', () => {
      renderHook(() => useScrollReveal({ threshold: 0.5 }));
      expect(lastOptions).toEqual(
        expect.objectContaining({ threshold: 0.5 })
      );
    });

    it('should use default rootMargin of 0px', () => {
      renderHook(() => useScrollReveal());
      expect(lastOptions).toEqual(
        expect.objectContaining({ rootMargin: '0px' })
      );
    });

    it('should use custom rootMargin', () => {
      renderHook(() => useScrollReveal({ rootMargin: '-100px' }));
      expect(lastOptions).toEqual(
        expect.objectContaining({ rootMargin: '-100px' })
      );
    });

    it('should use default triggerOnce of true', () => {
      const { result } = renderHook(() => useScrollReveal());

      // Simulate visibility
      act(() => {
        if (observeCallback) {
          observeCallback([
            {
              isIntersecting: true,
              target: document.createElement('div'),
              boundingClientRect: {} as DOMRectReadOnly,
              intersectionRatio: 0.5,
              intersectionRect: {} as DOMRectReadOnly,
              rootBounds: null,
              time: Date.now(),
            },
          ]);
        }
      });

      // Should stay visible even after leaving viewport
      act(() => {
        if (observeCallback) {
          observeCallback([
            {
              isIntersecting: false,
              target: document.createElement('div'),
              boundingClientRect: {} as DOMRectReadOnly,
              intersectionRatio: 0,
              intersectionRect: {} as DOMRectReadOnly,
              rootBounds: null,
              time: Date.now(),
            },
          ]);
        }
      });

      expect(result.current.isVisible).toBe(true);
    });
  });

  describe('observer lifecycle', () => {
    it('should create IntersectionObserver on mount', () => {
      renderHook(() => useScrollReveal());
      expect(constructorCallCount).toBe(1);
    });

    it('should disconnect observer on unmount', () => {
      const { unmount } = renderHook(() => useScrollReveal());

      unmount();

      expect(disconnectMock).toHaveBeenCalled();
    });

    it('should recreate observer when options change', () => {
      const { rerender } = renderHook(
        ({ threshold }) => useScrollReveal({ threshold }),
        { initialProps: { threshold: 0.1 } }
      );

      expect(constructorCallCount).toBe(1);

      rerender({ threshold: 0.5 });

      expect(constructorCallCount).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('should handle undefined options', () => {
      const { result } = renderHook(() => useScrollReveal(undefined));
      expect(result.current.isVisible).toBe(false);
      expect(result.current.elementRef).toBeDefined();
    });

    it('should handle empty options object', () => {
      const { result } = renderHook(() => useScrollReveal({}));
      expect(result.current.isVisible).toBe(false);
      expect(lastOptions).toEqual(
        expect.objectContaining({ threshold: 0.1, rootMargin: '0px' })
      );
    });

    it('should handle threshold of 0', () => {
      renderHook(() => useScrollReveal({ threshold: 0 }));
      expect(lastOptions).toEqual(
        expect.objectContaining({ threshold: 0 })
      );
    });

    it('should handle threshold of 1', () => {
      renderHook(() => useScrollReveal({ threshold: 1 }));
      expect(lastOptions).toEqual(
        expect.objectContaining({ threshold: 1 })
      );
    });
  });

  describe('ref assignment', () => {
    it('should return a ref that can be assigned to an element', () => {
      const { result } = renderHook(() => useScrollReveal());

      // The ref should be a valid React ref object
      expect(result.current.elementRef).toHaveProperty('current');
      expect(typeof result.current.elementRef).toBe('object');
    });
  });

  describe('unobserve behavior with triggerOnce', () => {
    it('should call unobserve when element becomes visible with triggerOnce=true and element exists', async () => {
      const { result } = renderHook(() => useScrollReveal({ triggerOnce: true }));

      // Manually set the ref to simulate a mounted element
      const mockElement = document.createElement('div');
      Object.defineProperty(result.current.elementRef, 'current', {
        value: mockElement,
        writable: true,
      });

      // Trigger visibility
      act(() => {
        if (observeCallback) {
          observeCallback([
            {
              isIntersecting: true,
              target: mockElement,
              boundingClientRect: {} as DOMRectReadOnly,
              intersectionRatio: 0.5,
              intersectionRect: {} as DOMRectReadOnly,
              rootBounds: null,
              time: Date.now(),
            },
          ]);
        }
      });

      await waitFor(() => {
        expect(result.current.isVisible).toBe(true);
      });

      // Verify unobserve was called
      expect(unobserveMock).toHaveBeenCalled();
    });

    it('should not call unobserve when element becomes visible with triggerOnce=false', async () => {
      const { result } = renderHook(() => useScrollReveal({ triggerOnce: false }));

      // Trigger visibility
      act(() => {
        if (observeCallback) {
          observeCallback([
            {
              isIntersecting: true,
              target: document.createElement('div'),
              boundingClientRect: {} as DOMRectReadOnly,
              intersectionRatio: 0.5,
              intersectionRect: {} as DOMRectReadOnly,
              rootBounds: null,
              time: Date.now(),
            },
          ]);
        }
      });

      await waitFor(() => {
        expect(result.current.isVisible).toBe(true);
      });

      // unobserve should not be called when triggerOnce is false
      expect(unobserveMock).not.toHaveBeenCalled();
    });
  });

  describe('multiple visibility changes', () => {
    it('should handle multiple enter/exit cycles with triggerOnce=false', async () => {
      const { result } = renderHook(() => useScrollReveal({ triggerOnce: false }));

      // First enter
      act(() => {
        observeCallback?.([
          {
            isIntersecting: true,
            target: document.createElement('div'),
            boundingClientRect: {} as DOMRectReadOnly,
            intersectionRatio: 0.5,
            intersectionRect: {} as DOMRectReadOnly,
            rootBounds: null,
            time: Date.now(),
          },
        ]);
      });
      expect(result.current.isVisible).toBe(true);

      // First exit
      act(() => {
        observeCallback?.([
          {
            isIntersecting: false,
            target: document.createElement('div'),
            boundingClientRect: {} as DOMRectReadOnly,
            intersectionRatio: 0,
            intersectionRect: {} as DOMRectReadOnly,
            rootBounds: null,
            time: Date.now(),
          },
        ]);
      });
      expect(result.current.isVisible).toBe(false);

      // Second enter
      act(() => {
        observeCallback?.([
          {
            isIntersecting: true,
            target: document.createElement('div'),
            boundingClientRect: {} as DOMRectReadOnly,
            intersectionRatio: 0.8,
            intersectionRect: {} as DOMRectReadOnly,
            rootBounds: null,
            time: Date.now(),
          },
        ]);
      });
      expect(result.current.isVisible).toBe(true);
    });
  });
});
