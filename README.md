# Elitea Playwright Automation

End-to-end UI and API test automation for **Elitea**, built with
[Playwright](https://playwright.dev/).

## Overview

This repository hosts the Playwright-based test automation suite for Elitea. It
turns manual test cases into maintainable, honest automated tests — reliable in
CI and clear about what they verify.

## Tech stack

- **[Playwright](https://playwright.dev/)** — browser automation and test runner
- **Node.js** — runtime
- **[Playwright MCP](https://github.com/microsoft/playwright-mcp)** — configured
  in `.mcp.json` for agent-assisted authoring and debugging

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or newer
- npm (bundled with Node.js)

### Setup

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install

# Configure environment (copy and fill in real values)
cp .env.example .env
```

### Running tests

```bash
# Run the full suite
npx playwright test

# Run in headed mode
npx playwright test --headed

# Run a single spec
npx playwright test path/to/spec.ts

# Open the HTML report
npx playwright show-report
```

## Project structure

```
.
├── tests/
│   ├── fixtures/env.ts   # fail-fast env loader (BASE_URL, ELITEA_EMAIL, ELITEA_PASSWORD)
│   └── bootstrap.spec.ts # scaffold-proving smoke test
├── playwright.config.ts
├── .env.example          # copy to .env and fill in real values
├── .mcp.json             # Playwright MCP server configuration
└── README.md
```

## Contributing

- Branch from `main` using `feat/`, `fix/`, `chore/`, or `docs/` prefixes.
- Keep tests independent and deterministic — no reliance on execution order or
  shared state.
- Never mask product defects with skipped or weakened assertions; file a ticket
  instead.
