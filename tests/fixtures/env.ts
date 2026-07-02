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

export const env = {
  BASE_URL: required('BASE_URL'),
  ELITEA_EMAIL: required('ELITEA_EMAIL'),
  ELITEA_PASSWORD: required('ELITEA_PASSWORD'),
};
