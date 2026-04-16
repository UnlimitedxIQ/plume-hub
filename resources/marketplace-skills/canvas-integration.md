---
name: canvas-integration
description: Connect to Canvas LMS to retrieve assignments, due dates, grades, and rubrics for the student's courses.
---

# Canvas Integration

## Purpose
Provides direct access to a student's Canvas LMS account so Claude can pull assignments, modules, syllabi, and grades on demand. Use whenever the user mentions homework, what's due, or any course-specific question that requires real Canvas data instead of guessing.

## When to use
- The user asks "what's due this week" or "what assignments do I have"
- The user references a specific course or assignment by name
- The user wants to see a rubric, grade, or feedback from an instructor
- The user asks about modules, lecture notes, or course materials hosted in Canvas
- The user wants to plan their week around upcoming deadlines

## Approach
- Authenticate with the user's Canvas API token from the local vault
- Query the relevant endpoint (courses, assignments, submissions, rubrics)
- Filter by enrollment status so retired courses do not pollute results
- Format results as a tight, scannable list with due dates and point values
- Surface anything urgent (within 48h) at the top of the response
