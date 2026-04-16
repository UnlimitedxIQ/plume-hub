---
name: Bug report
about: Something broke or behaves incorrectly
title: '[bug] '
labels: bug
assignees: ''
---

## What happened

<!-- One-sentence summary. What did you click / type / expect vs. what you got. -->

## Steps to reproduce

1.
2.
3.

## Environment

- Plume Hub version: <!-- Settings → Advanced → shows a "v1.0.0" style label, or check the installer filename -->
- OS: <!-- Windows 11 / macOS 14.x / etc. -->
- Claude Code CLI version: <!-- run `claude --version` in a terminal -->

## Bundled library state (optional, helpful for install-related bugs)

```
# PowerShell:  ls ~/.claude/agents/ | measure | %{ $_.Count }
# Bash:        ls ~/.claude/agents/ | wc -l
```

Agents count:
Skills count:

## Logs / screenshots

<!-- Attach anything useful. For UI crashes, the error boundary shows a stack
     trace — screenshot that. For launcher issues, the PowerShell / Terminal
     window usually prints the error; paste the last 10-20 lines. -->
