/**
 * Framer Motion UI animations barrel export.
 * Import from '@/animations/ui' for all UI animation patterns.
 *
 * @example
 * ```tsx
 * import { pageVariants, modalVariants, chartContainerVariants } from '@/animations/ui';
 * ```
 */

// Page transitions
export {
  pageVariants,
  pageFadeVariants,
  pageScaleVariants,
  pageSlideUpVariants,
} from './pageTransitions';

// Modal and sheet animations
export {
  overlayVariants,
  modalVariants,
  bottomSheetVariants,
  sideSheetVariants,
  leftDrawerVariants,
  createSheetDragHandler,
  createSideSheetDragHandler,
} from './modals';

// Chart animations
export {
  chartContainerVariants,
  chartElementVariants,
  chartRingVariants,
  planetSymbolVariants,
  emphasisPulseTransition,
  useChartEmphasis,
  chartGlowVariants,
  orbitLineVariants,
} from './charts';

// Card animations
export {
  cardContainerVariants,
  cardVariants,
  cardInteractionVariants,
  cardFlipVariants,
  getStackedCardStyle,
  swipeCardVariants,
  createSwipeHandler,
  swipeDragConstraints,
} from './cards';

// List animations
export {
  listContainerVariants,
  listItemVariants,
  listItemSlideRightVariants,
  listItemFadeUpVariants,
  reorderItemVariants,
  collapseVariants,
  emptyStateVariants,
} from './lists';

// Chat animations
export {
  chatContainerVariants,
  incomingMessageVariants,
  outgoingMessageVariants,
  systemMessageVariants,
  typingIndicatorVariants,
  typingDotContainerVariants,
  typingDotVariants,
  reactionVariants,
  messageBubblePopVariants,
  messageHighlightVariants,
} from './chat';

// Gesture utilities
export {
  DRAG_CONSTRAINTS,
  DRAG_ELASTIC,
  createDirectionalDragHandler,
  useDragSpring,
  useParallax,
  useTilt,
  useDragScale,
  type DragDirectionHandlers,
} from './gestures';

// Shared element transitions
export {
  LAYOUT_IDS,
  sharedLayoutTransition,
  smoothLayoutTransition,
  quickLayoutTransition,
  fadeVariants,
  scaleFadeVariants,
  slideUpFadeVariants,
  slideDownFadeVariants,
  popoverVariants,
  tooltipVariants,
  focusRingVariants,
} from './shared';
