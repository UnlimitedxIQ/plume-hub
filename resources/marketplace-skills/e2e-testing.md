---
name: e2e-testing
description: End-to-end testing with Playwright — Page Object Model, CI integration, and strategies for flaky tests.
---

# E2E Testing

## Purpose
Reference for building robust end-to-end test suites with Playwright — Page Object Model, configuration, CI integration, artifact management, and strategies for handling flaky tests.

## When to use
- Setting up Playwright for a new project
- Adding E2E coverage to critical user flows
- Refactoring brittle E2E tests into Page Object Model
- Diagnosing flaky tests in CI
- Capturing screenshots, videos, and traces for debugging

## Approach
- Test critical user flows first: signup, login, purchase, core feature
- Use Page Object Model to isolate selectors from test logic
- Wait on web-first assertions, not arbitrary timeouts
- Run tests in parallel locally and in CI
- Save screenshots, videos, and traces only on failure
