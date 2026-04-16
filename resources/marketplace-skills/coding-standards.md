---
name: coding-standards
description: Apply consistent coding conventions for naming, formatting, file organization, and code quality across projects.
---

# Coding Standards

## Purpose
Establishes and enforces coding conventions so the codebase stays readable as it grows. Covers naming, formatting, file organization, comment style, and review checklists. Use whenever introducing a new file, refactoring an old one, or onboarding to an unfamiliar codebase.

## When to use
- Starting a new file and unsure about naming conventions
- Reviewing code and looking for style or quality issues
- Refactoring a messy module
- Onboarding to a codebase with unclear conventions
- Setting up linters and formatters for a new project

## Approach
- Default to language idioms (PEP 8 for Python, Airbnb / Standard for JS/TS)
- Many small files over few large files (200-400 lines is healthy)
- Functions stay under 50 lines, max nesting depth 4
- Names describe intent, not type (avoid Hungarian notation)
- Run formatters and linters on every save
