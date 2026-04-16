---
name: api-design
description: Design REST and RPC APIs that are clean, consistent, well-versioned, and easy to consume.
---

# API Design

## Purpose
Reference for designing APIs that downstream developers actually enjoy using. Covers REST conventions, resource naming, status codes, pagination, filtering, error responses, versioning, and rate limiting.

## When to use
- Designing a new public or internal API
- Reviewing an existing API for inconsistencies
- Adding pagination, filtering, or sorting to endpoints
- Versioning an API ahead of breaking changes
- Writing API documentation for downstream consumers

## Approach
- Name resources as nouns, not verbs (POST /users, not /createUser)
- Use HTTP status codes correctly (201 for create, 204 for delete, 422 for validation)
- Standardize the response envelope across every endpoint
- Paginate all list endpoints by default
- Version in the URL or header — pick one and be consistent
