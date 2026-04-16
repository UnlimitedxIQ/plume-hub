---
name: docker-patterns
description: Containerize applications with Docker — clean Dockerfiles, multi-stage builds, Compose, and security hardening.
---

# Docker Patterns

## Purpose
Reference for containerizing applications with Docker — writing efficient Dockerfiles, using multi-stage builds, composing services, and hardening containers for production.

## When to use
- Containerizing an app for the first time
- Optimizing slow or bloated image builds
- Setting up Docker Compose for local development
- Hardening a container before production deployment
- Debugging networking or volume issues across services

## Approach
- Start from the smallest viable base image (alpine, distroless)
- Use multi-stage builds to keep final images lean
- Run as a non-root user inside the container
- Pin versions explicitly in FROM and apt/apk commands
- Compose services for local dev, but deploy with orchestration in prod
