---
name: backend-patterns
description: REST API design, server architecture, error handling, and database access patterns for backend services.
---

# Backend Patterns

## Purpose
Reference for building production backend services — REST API design, request validation, error handling, database access, authentication, and rate limiting. Applies to Node.js, Python, Go, and similar server stacks.

## When to use
- Designing a new REST or RPC API
- Structuring a backend project layout
- Implementing authentication, authorization, or rate limiting
- Choosing between sync and async patterns
- Refactoring a monolithic handler into smaller pieces

## Approach
- Use a consistent response envelope (success, data, error)
- Validate every input at the system boundary with a schema
- Return correct HTTP status codes (404 for missing, 422 for validation, 5xx for server)
- Centralize error handling so handlers stay thin
- Separate route handlers from business logic from data access
