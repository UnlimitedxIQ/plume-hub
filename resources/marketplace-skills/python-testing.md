---
name: python-testing
description: Python testing with pytest — fixtures, mocking, parametrization, coverage, and TDD methodology.
---

# Python Testing

## Purpose
Reference for testing Python code with pytest — writing fast unit tests, using fixtures and mocks, parametrizing tests, and measuring coverage. Includes TDD workflow guidance.

## When to use
- Setting up pytest for a new Python project
- Adding tests to a legacy untyped codebase
- Mocking out network, filesystem, or database dependencies
- Parametrizing a test that runs against many inputs
- Measuring and improving test coverage

## Approach
- Use pytest as the default test runner
- Write tests as plain functions starting with test_
- Use fixtures for setup/teardown, conftest.py for shared fixtures
- Mock at the boundary of the system, not deep inside it
- Aim for 80%+ coverage on critical paths, less on glue code
