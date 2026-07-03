#!/usr/bin/env node
// Reads the Playwright `json` reporter's output (playwright.config.ts's
// existing ['json', { outputFile: 'test-results/json/run.json' }] entry --
// this script does not add or change that reporter) and appends a concise
// markdown pass/fail table + per-failure reasons to $GITHUB_STEP_SUMMARY.
//
// Run with `if: always()` in the workflow so it still produces a summary
// when the test step itself failed. Never throws on a missing/malformed
// report -- worst case it writes a "no report found" note, since a summary
// script crash must not mask the real test outcome that already ran.
//
// JSON reporter schema confirmed against the installed @playwright/test
// version (see node_modules/playwright/lib/runner/index.js,
// createJSONReport()/_serializeSuite()/_serializeTest()):
//   report.stats            -> { startTime, duration, expected, skipped, unexpected, flaky }
//   report.suites[]         -> { title, file, line, column, specs[], suites[] } (specs/suites both optional, recurse)
//   suite.specs[].tests[]   -> { status: 'expected'|'unexpected'|'flaky'|'skipped', results[] }
//   test.results[]          -> { status, error, errors[], ... } (last entry is the final attempt)
//
// stats key -> report meaning (Test.outcome()):
//   expected   = passed as expected            -> "Passed" column
//   unexpected = failed (all retries exhausted) -> "Failed" column
//   flaky      = failed then passed on retry    -> "Flaky" column
//   skipped    = test.skip()/fixme               -> "Skipped" column

const fs = require('fs');

const REPORT_PATH = process.argv[2] || 'test-results/json/run.json';
const summaryPath = process.env.GITHUB_STEP_SUMMARY;

function readReport(reportPath) {
  if (!fs.existsSync(reportPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
  } catch (err) {
    console.error(`summarize-results: failed to parse ${reportPath}: ${err.message}`);
    return null;
  }
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return 'n/a';
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(1);
  return `${minutes}m ${seconds}s`;
}

function escapeCell(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

// Playwright error messages carry ANSI color codes (verified against a real
// run.json produced locally -- e.g. "[2mexpect([22m..."). Strip
// them so the step summary renders clean text instead of escape garbage.
function stripAnsi(value) {
  // eslint-disable-next-line no-control-regex
  return String(value).replace(/\x1b\[[0-9;]*m/g, '');
}

// Recursively walk suites -> specs -> tests, collecting every test whose
// final outcome is 'unexpected' (a real failure, not flaky-then-passed).
// `depth` tracks nesting so the top-level file suite (title === filename,
// confirmed via a real run.json) is excluded from the breadcrumb -- it only
// duplicates the Location column. Nested test.describe() titles (e.g.
// '@smoke') are kept.
function collectFailures(suites, breadcrumb = [], depth = 0) {
  const failures = [];
  for (const suite of suites || []) {
    const nextBreadcrumb = depth === 0 || !suite.title ? breadcrumb : [...breadcrumb, suite.title];
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        if (test.status !== 'unexpected') continue;
        const results = test.results || [];
        const lastResult = results[results.length - 1];
        const rawMessage =
          lastResult?.error?.message ||
          lastResult?.errors?.[0]?.message ||
          'No error message captured (see HTML/JSON report artifact for full trace).';
        const firstLine = stripAnsi(rawMessage).split('\n')[0].slice(0, 200);
        failures.push({
          title: [...nextBreadcrumb, spec.title].filter(Boolean).join(' > '),
          location: `${spec.file}:${spec.line}`,
          reason: firstLine,
        });
      }
    }
    failures.push(...collectFailures(suite.suites, nextBreadcrumb, depth + 1));
  }
  return failures;
}

function buildMarkdown(report) {
  if (!report) {
    return [
      '## Playwright Run Summary',
      '',
      `_No report found at \`${REPORT_PATH}\` -- the test step likely crashed before writing any results. Check the job log above._`,
      '',
    ].join('\n');
  }

  const stats = report.stats || {};
  const passed = stats.expected ?? 0;
  const failed = stats.unexpected ?? 0;
  const flaky = stats.flaky ?? 0;
  const skipped = stats.skipped ?? 0;
  const total = passed + failed + flaky + skipped;
  const duration = formatDuration(stats.duration);

  const lines = [];
  lines.push('## Playwright Run Summary');
  lines.push('');
  lines.push('| Total | Passed | Failed | Flaky | Skipped | Duration |');
  lines.push('|---|---|---|---|---|---|');
  lines.push(`| ${total} | ${passed} | ${failed} | ${flaky} | ${skipped} | ${duration} |`);
  lines.push('');

  const failures = collectFailures(report.suites);

  if (failed === 0) {
    lines.push('_No failures._');
    lines.push('');
  } else if (failures.length === 0) {
    // Should not happen given `failed` came from the same report, but never
    // let a shape mismatch hide the fact that failures exist.
    lines.push(`_${failed} failing test(s) reported, but detail could not be extracted -- see the HTML/JSON report artifacts._`);
    lines.push('');
  } else {
    lines.push('### Failed tests');
    lines.push('');
    lines.push('| Test | Location | Reason |');
    lines.push('|---|---|---|');
    for (const f of failures) {
      lines.push(`| ${escapeCell(f.title)} | \`${escapeCell(f.location)}\` | ${escapeCell(f.reason)} |`);
    }
    lines.push('');
  }

  lines.push('Full traces/screenshots: `playwright-html-report` and `playwright-json-report` build artifacts on this run.');
  lines.push('');

  return lines.join('\n');
}

const report = readReport(REPORT_PATH);
const markdown = buildMarkdown(report);

if (!summaryPath) {
  // No GITHUB_STEP_SUMMARY (e.g. running this script locally) -- print
  // instead of failing, so this stays safe to invoke outside CI too.
  console.log(markdown);
} else {
  fs.appendFileSync(summaryPath, markdown + '\n');
}
