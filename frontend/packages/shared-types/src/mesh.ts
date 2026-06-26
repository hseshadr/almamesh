/**
 * Mesh relationship vocabulary — the typed "people layer" contract.
 *
 * AlmaMesh's north star is a mesh of souls: one anchor person ("self") plus
 * the family/friends whose charts weave into theirs. Profiles carry an
 * optional relationship to the anchor; the mesh math consumes these labels.
 *
 * IMPORTANT: the member values MUST match the backend relationship enum
 * byte-for-byte (spouse/partner/mother/father/child/sibling/friend/business).
 * `self` is frontend-only — it marks the anchor profile and is never sent to
 * the engine as a relationship.
 */

/** Relationships a member can have to the anchor — mirrors the backend enum. */
export const MEMBER_RELATIONSHIPS = [
  'spouse',
  'partner',
  'mother',
  'father',
  'child',
  'sibling',
  'friend',
  'business',
] as const;

/** A member's relationship to the anchor (backend-aligned string values). */
export type MemberRelationship = (typeof MEMBER_RELATIONSHIPS)[number];

/** Every assignable relationship, including the frontend-only anchor marker. */
export const RELATIONSHIPS = ['self', ...MEMBER_RELATIONSHIPS] as const;

/** `self` (the anchor) or a member relationship. */
export type Relationship = (typeof RELATIONSHIPS)[number];
