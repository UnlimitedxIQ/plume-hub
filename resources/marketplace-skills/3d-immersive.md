---
name: 3d-immersive
description: Build 3D and immersive web experiences with React Three Fiber, Spline, GSAP ScrollTrigger, and Lenis smooth scroll.
---

# 3D Immersive

## Purpose
Builds interactive 3D and immersive websites — scroll-based animations, particle effects, 3D scenes, and cinematic landing pages. Combines React Three Fiber, Spline, GSAP ScrollTrigger, and Lenis for smooth scroll.

## When to use
- The user wants a 3D or interactive landing page
- A site needs scroll-driven animations or parallax
- Embedding a Spline scene or Three.js model
- Building a hero section with particles or fluid simulation
- Creating an award-style portfolio or product launch site

## Approach
- Pick the right tool: Spline for designer-driven scenes, R3F for code-driven
- Optimize models early — 3D performance is fragile on mobile
- Use GSAP ScrollTrigger for scroll-driven sequences
- Add Lenis for smooth scroll on desktop, disable on mobile if needed
- Test on a real low-end device before shipping
