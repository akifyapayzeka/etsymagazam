# Prompt library

Every AI text/image call the autopilot makes goes through a versioned
prompt file here — no prompt strings are hard-coded inline in
`apps/worker` agent code. This keeps prompt iteration auditable: every
`generation_costs` / `agent_decisions` row records which `promptVersion`
was used, so you can correlate a prompt change with a change in QA pass
rate, conversion, or cost.

## Layout

```
prompts/
  <task-name>/
    v1.json
    v2.json   ← never edit v1.json in place; add v2 and point new code at it
```

Each file is a small JSON document:

```json
{
  "id": "seo-copywriting",
  "version": 1,
  "tier": "cheap",
  "system": "…",
  "userTemplate": "…{{title}}…",
  "notes": "human-readable context for why this prompt is shaped this way"
}
```

`userTemplate` uses `{{variableName}}` placeholders, filled in by
`packages/core`'s `loadPrompt()` / `renderPrompt()` helpers.

## Versioning rules

- Never mutate a prompt file that has already been used in production —
  bump the version instead. Old versions stay around for audit/rollback.
- `tier` is a hint to `packages/ai`'s router (`cheap` vs `premium` model),
  not a hard requirement — the calling agent can still override it.
- Keep prompts deterministic in intent: they should produce *copy* and
  *concepts*, never layout/typography decisions (that's
  `packages/product-generator`'s job, by design — see
  `docs/ARCHITECTURE.md`).

## Current prompt tasks

| Task | Used by | Purpose |
|---|---|---|
| `trend-research` | Trend Scout Agent | Summarize raw keyword/trend signals into a human-readable opportunity rationale |
| `product-ideation` | Product Strategy Agent | Turn a scored opportunity into a concrete product concept (title, angle, content outline) |
| `seo-copywriting` | SEO Agent | Generate Etsy title, description, and tag candidates from a product concept |
| `design-concept` | Design Agent | Optional AI-image concept/mood direction when a template alone isn't enough |
| `customer-messaging` | Alert & Reporting Agent | Draft the plain-language "attention required" summary for a human review case |
