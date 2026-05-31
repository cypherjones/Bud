/**
 * One-paycheck cash cushion that must land in savings before any Houston/Move
 * savings allocation flows. Hardcoded for now since it's universal advice;
 * could become a setting later if a user wants a thicker floor.
 *
 * Used by both the budget strategy ("Phase 2 → 3" gate) and the move-plan's
 * computed currentSaved ("buffer first, Houston gets the surplus").
 */
export const BUFFER_TARGET_CENTS = 150000;
