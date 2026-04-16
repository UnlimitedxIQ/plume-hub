---
name: python-patterns
description: Pythonic idioms, type hints, and patterns for clean, maintainable Python code.
---

# Python Patterns

## Purpose
Reference for idiomatic Python — how to use comprehensions, generators, dataclasses, type hints, context managers, and the standard library effectively. Use when writing new Python or refactoring code that fights the language.

## When to use
- Writing a new Python module or script
- Refactoring code that feels un-Pythonic
- Choosing between dataclass, NamedTuple, TypedDict, or pydantic
- Adding type hints to an untyped codebase
- Translating logic from another language into idiomatic Python

## Approach
- Prefer comprehensions over manual loops when readable
- Use dataclasses for simple data containers, pydantic for validated input
- Type-hint every public function and class attribute
- Use context managers for any resource that needs cleanup
- Keep modules small and focused; favor composition over inheritance
