---
name: postgresql
description: PostgreSQL schema design, indexing, query optimization, migrations, and connection pooling.
---

# PostgreSQL

## Purpose
Reference for working effectively with PostgreSQL — schema design, indexing strategy, query optimization, migrations, RLS, and connection pooling. Covers raw SQL plus Prisma, Drizzle, and other ORMs.

## When to use
- Designing a new schema or extending an existing one
- Diagnosing a slow query with EXPLAIN
- Choosing between btree, gin, gist, or partial indexes
- Setting up connection pooling (pgbouncer, supabase pooler)
- Writing safe migrations that won't lock tables in production

## Approach
- Normalize first, denormalize only when measured
- Index based on actual query patterns, not guesses
- Use EXPLAIN ANALYZE to verify every slow query fix
- Keep migrations small, additive, and reversible
- Pool connections in production — Postgres connections are expensive
