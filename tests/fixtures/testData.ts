/**
 * Test-data generation helpers shared across the `agents` module spec
 * (`tests/agents.spec.ts`) and the `pipelines` module spec
 * (`tests/pipelines.spec.ts`).
 *
 * `uniqueEntityName` centralizes the "stay under the Name field's 32-char
 * cap" budget that every TC-010..019 (Agents) AND every TC-020..029
 * (Pipelines) AFS independently discovered and recommended centralizing
 * (see GH#27, retitled "(Agents + Pipelines)" once the pipelines-module
 * analysts cross-module-corroborated the identical `maxLength="32"` on the
 * Pipeline Name field -- confirmed via `input.maxLength === 32` and via the
 * create-response body itself already containing the truncated value, on
 * BOTH entity types). Each AFS re-derived this math per-case; this is the
 * single place it lives now, per TC-011/TC-014/TC-017's (Agents) and
 * TC-021/TC-024's (Pipelines) own "centralize this in one test-data helper"
 * recommendation.
 */

/**
 * Generates a unique entity Name of the shape `${prefix}_${Date.now()}` and
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
export function uniqueEntityName(prefix: string): string {
  const name = `${prefix}_${Date.now()}`;
  if (name.length > 32) {
    throw new Error(
      `Generated name "${name}" (${name.length} chars) exceeds the Name field's ` +
        `32-char cap (GH#27) -- shorten the prefix "${prefix}".`,
    );
  }
  return name;
}

/** Agents module (`tests/agents.spec.ts`) -- unchanged behavior, now backed
 * by the shared `uniqueEntityName` helper. */
export function uniqueAgentName(prefix: string): string {
  return uniqueEntityName(prefix);
}

/** Pipelines module (`tests/pipelines.spec.ts`) -- same 32-char cap (GH#27,
 * cross-module-confirmed), extended per every pipelines-module AFS's own
 * recommendation to reuse the Agents module's naming helper rather than
 * re-deriving it. */
export function uniquePipelineName(prefix: string): string {
  return uniqueEntityName(prefix);
}
