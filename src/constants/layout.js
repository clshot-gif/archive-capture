// Shared vertical anchor for the primary action row on Scanner (shutter),
// Markup (comment / keep scanning / save), and Confirmation (Done) — found by
// feel to sit lower than a first-draft mid-screen placement but higher than
// flush against the bottom edge (where a native camera shutter usually
// sits). Keeping all three screens pinned to the same distance from the
// bottom edge, with the same row height, is what makes them visually line up
// even though the content above each row is completely different.
export const CONTROL_ROW_BOTTOM = 56;
export const CONTROL_ROW_HEIGHT = 76;
