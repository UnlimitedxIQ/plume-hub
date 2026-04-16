---
name: tdd-workflow
description: Test-driven development workflow — write tests first, then implement, then refactor.
---

# TDD Workflow

## Purpose
Guides the user through disciplined test-driven development: red, green, refactor. Use whenever adding a new feature, fixing a bug, or refactoring legacy code that lacks coverage.

## When to use
- Starting a new feature and wanting tests to drive the design
- Fixing a bug that should never regress
- Adding coverage to legacy code before refactoring
- Onboarding to a TDD-first codebase
- Verifying that a flaky test is actually testing the right thing

## Approach
- Write the smallest failing test that captures the requirement (RED)
- Write the minimum code to make it pass (GREEN)
- Refactor for clarity without changing behavior (REFACTOR)
- Repeat until the feature is complete
- Aim for 80%+ coverage on critical paths
