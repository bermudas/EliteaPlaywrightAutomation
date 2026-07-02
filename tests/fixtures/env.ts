/**
 * Fail-fast environment loader.
 *
 * Every test/config module that needs BASE_URL / ELITEA_EMAIL / ELITEA_PASSWORD
 * imports from here instead of touching `process.env` directly, so there is a
 * single place that owns the required-key list and the fail-fast behavior.
 *
 * See .agents/testing.md § Conventions — "Env values via tests/fixtures/env.ts
 * only — grep before adding a new env key."
 */
import * as dotenv from 'dotenv';

dotenv.config();

function required(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable: ${key}. ` +
        `Copy .env.example to .env and fill in real values.`,
    );
  }
  return value;
}

/**
 * Every AFS in this suite (and the existing bootstrap.spec.ts) writes
 * navigation targets as template literals: `${env.BASE_URL}/app/chat/`.
 * `.env`/`.env.example` both store BASE_URL WITH a trailing slash
 * (`https://next.elitea.ai/`), which produces a double slash
 * (`https://next.elitea.ai//app/chat/`) once concatenated with a leading-
 * slash path. Root-caused during @smoke implementation (2026-07-02, TC-002):
 * the double-slash URL 404s when navigated to *while authenticated* (the
 * SPA's client-side router does not normalize it) even though the identical
 * double-slash URL redirects correctly *while logged out* (that path is a
 * top-level auth redirect that happens to tolerate it) -- so the pre-existing
 * bootstrap.spec.ts (logged-out only) never surfaced this. Stripping the
 * trailing slash once, here, fixes every call site without requiring each
 * one to remember not to add its own leading slash.
 */
export const env = {
  BASE_URL: required('BASE_URL').replace(/\/+$/, ''),
  ELITEA_EMAIL: required('ELITEA_EMAIL'),
  ELITEA_PASSWORD: required('ELITEA_PASSWORD'),
};
