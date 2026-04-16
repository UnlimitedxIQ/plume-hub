---
name: frontend-patterns
description: React, Next.js, and modern frontend patterns for components, state, performance, and UI architecture.
---

# Frontend Patterns

## Purpose
Reference for building modern frontend applications — component composition, state management, hooks, performance, and accessibility. Focused on React and Next.js but applicable to most component-based frameworks.

## When to use
- Designing a new React component or feature
- Choosing between local state, context, and a state manager (Zustand, Redux)
- Optimizing render performance or bundle size
- Adding accessibility to an existing UI
- Refactoring a tangled component tree

## Approach
- Build small, single-responsibility components
- Lift state only as high as it needs to go
- Memoize expensive renders, not everything
- Use semantic HTML and ARIA attributes by default
- Co-locate styles, tests, and stories with each component
