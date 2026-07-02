/**
 * Test-data generation helpers shared across the `agents` module spec
 * (`tests/agents.spec.ts`).
 *
 * `uniqueAgentName` centralizes the "stay under the Name field's 32-char
 * cap" budget that every TC-010..019 AFS independently discovered and
 * recommended centralizing (see GH#27 -- the Agent Name field silently
 * truncates at 32 characters with zero visual feedback; confirmed via
 * `input.maxLength === 32` and via the create-response body itself already
 * containing the truncated value). Each AFS re-derived this math per-case;
 * this is the single place it lives now, per TC-011/TC-014/TC-017's own
 * "centralize this in one test-data helper" recommendation.
 */

/**
 * Generates a unique Agent Name of the shape `${prefix}_${Date.now()}` and
 * throws if the result would exceed the Name field's confirmed 32-char cap
 * (GH#27), rather than silently truncating like the product does. A test
 * that needs a longer name should shorten its own prefix, not rely on this
 * helper to reproduce the product's own silent-data-loss defect inside the
 * test's own data.
 *
 * `Date.now()` is always a 13-digit ms timestamp on any date this suite
 * will run (safe through the year 2286) -- keep `prefix` to <= 18 chars
 * (including its own trailing separator) so the full timestamp survives.
 */
export function uniqueAgentName(prefix: string): string {
  const name = `${prefix}_${Date.now()}`;
  if (name.length > 32) {
    throw new Error(
      `Generated agent name "${name}" (${name.length} chars) exceeds the Name field's ` +
        `32-char cap (GH#27) -- shorten the prefix "${prefix}".`,
    );
  }
  return name;
}
