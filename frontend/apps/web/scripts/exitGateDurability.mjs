const ACTIVE_POINTER_NAMES = new Set(['active', 'active.a', 'active.b'])

export function isActivePointerName(name) {
  return ACTIVE_POINTER_NAMES.has(name)
}
