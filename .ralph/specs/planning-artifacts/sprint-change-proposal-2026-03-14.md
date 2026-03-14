---
status: APPROVED
date: '2026-03-14'
scope: Major
trigger: Architecture decisions 6-8 changed product scope
---

# Sprint Change Proposal

**Date:** 2026-03-14
**Status:** Approved
**Change Scope:** Major

## Issue Summary

Architecture decisions fundamentally changed codeharness from "harness plugin alongside bmalph" to "BMAD distribution with harness built in that replaces bmalph." Additionally, mandatory retrospectives with actionable follow-up were added as a core feature.

## Changes Applied to PRD

1. **Executive Summary** — Reframed from "works alongside bmalph" to "replaces bmalph, combines BMAD + Ralph + harness"
2. **Project Classification** — Complexity updated to Medium-High
3. **User Journey 2** — Rewritten as "Migrating from bmalph" (was "Existing bmalph project")
4. **FR4-FR5** — Updated: BMAD installation + bmalph migration (was: detect and coexist)
5. **BMAD Integration → BMAD Ownership** — Renamed, expanded from 6 FRs to 9 FRs (FR36-FR44) including harness patches
6. **New: Autonomous Execution Loop** — 5 FRs (FR45-FR49) for vendored Ralph loop
7. **New: Sprint Retrospective & Follow-up** — 6 FRs (FR50-FR55) for mandatory retros
8. **Standalone Mode** — Renumbered (FR56-FR58)
9. **Status & Reporting** — Renumbered (FR59-FR61)
10. **MVP Scope** — Added 5 capabilities (BMAD ownership, patching, Ralph loop, migration, retros). Removed "Self-correcting execution" from post-MVP (retros now MVP).
11. **NFR18-NFR20** — Added for BMAD install time, patch idempotency, retro generation time
12. **Command Surface** — Added `/harness-run`
13. **Phase 2** — Multi-platform: Codex + OpenCode only (no Cursor/Copilot)

**Total FRs:** 47 → 61 (+14)
**Total NFRs:** 17 → 20 (+3)

## Handoff

PRD updated. Architecture already reflects these decisions. Ready for epic creation.
