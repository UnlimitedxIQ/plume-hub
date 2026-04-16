---
name: deployment
description: Deploy applications to production safely — CI/CD, blue-green, canary, rollbacks, and zero-downtime releases.
---

# Deployment

## Purpose
Guides safe production deployments — CI/CD pipelines, deployment strategies (blue-green, canary, rolling), health checks, rollbacks, and zero-downtime release patterns.

## When to use
- Setting up CI/CD for the first time
- Choosing a deployment strategy (blue-green vs canary vs rolling)
- Adding health checks and readiness probes
- Planning a zero-downtime database migration
- Designing a rollback strategy after a bad release

## Approach
- Build once, deploy many — promote the same artifact through environments
- Add health checks, readiness probes, and graceful shutdown
- Default to rolling deploys; use canary for risky releases
- Automate rollbacks on health-check failure
- Run smoke tests against production immediately after deploy
