# CLAUDE.md — Boondock Map

If this repo has an `AGENTS.md`, read it before substantive work — it complements this file.

Project context for Claude Code sessions in this repo. An offline-capable
topographic mapping app (desktop + web) built on **MapLibre GL JS + React 18 +
Electron** — a TypeScript/JS app, not an R analysis repo. See `README.md` for the
stack and tile sources.

**Lead:** Tim Thomas

---

## Code standards

This is a TypeScript / React / Electron app, so the R-pipeline *mechanics* in the
shared library don't apply. The durable *values* do — match the surrounding
style, keep the surface plain, double-check before shipping, and skip chatty
`console.log` noise:

- **`~/git/evictionresearch/library/CODE_PHILOSOPHY.md`** — the values: code voice,
  double-check discipline, simplicity, the human+Claude collaboration contract.
- **`~/git/evictionresearch/library/CODE_CONVENTIONS.md` → Mapping stack** — the
  MapLibre + PMTiles standard is shared and *does* apply here.

## Standing rules

- **Keep the in-app Guide current** (Tim, 2026-07-12): whenever a user-facing
  feature is added or changed, update the matching tab content in
  `boondock/src/renderer/components/Guide.jsx` in the same commit. The Guide
  must only describe features that actually exist and work.
- **Every feature request goes into `VISION.md`'s backlog table** — nothing
  gets dropped; mark rows shipped with date + evidence.

## Repo orientation

- **`README.md`** — what it is, the tech stack, tile sources.
- **`BRAND.md`** — Boondock Map brand guide (separate from CiDR Lab branding).

<!-- BEGIN factual-accuracy (synced from evictionresearch/library/standards/claude-md-factual-accuracy.md — edit there, then run library/scripts/sync_claude_md_standard.py) -->
## Factual accuracy — non-negotiable

Everything must be factually true. This overrides helpfulness, completeness, and the urge to sound finished.

- **Never fabricate** — no invented numbers, citations, file paths, function names, API behaviors, or results. If you don't know, say so.
- **Verify before asserting** — ground every factual claim in something checked this session (a file read, a command run, a source fetched). Don't assert from memory when the answer is checkable.
- **Label thought exercises** — open any speculation or hypothetical with an explicit **[Thought exercise]** marker so it's never mistaken for fact.
- **Mark confidence when it matters** — for consequential claims you couldn't fully verify, flag the uncertainty and how to confirm it. Distinguish *verified* (checked) from *inferred* (reasoned) from *assumed* (unchecked).
- **Build only on solid ground** — analysis must rest on prior facts or analysis already established correct; flag unverified dependencies before building on them.
- **Report outcomes honestly** — failures, skipped steps, and partial results get stated plainly with evidence. Never round a partial result up to "done."
<!-- END factual-accuracy -->
