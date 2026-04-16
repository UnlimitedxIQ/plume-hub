---
name: security-review
description: Review code and infrastructure for security vulnerabilities — auth, input validation, secrets, and common attack patterns.
---

# Security Review

## Purpose
Reviews code, configuration, and infrastructure for security vulnerabilities. Covers authentication, authorization, input validation, secrets management, SQL injection, XSS, CSRF, and common attack patterns. Use before any commit that touches sensitive surfaces.

## When to use
- Adding authentication or authorization to a new feature
- Handling user input that reaches a database or shell
- Storing or transmitting secrets and credentials
- Creating new API endpoints that take untrusted input
- Implementing payments, file uploads, or admin features

## Approach
- Validate every input at the system boundary with a schema
- Use parameterized queries — never string-concatenate SQL
- Sanitize HTML output to prevent XSS
- Store secrets in env vars or a secret manager, never in code
- Run a checklist pass before every commit that touches sensitive code
