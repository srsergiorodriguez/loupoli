# loupoli documentation

This directory is the documentation set for `loupoli`. It is intentionally organized by ownership: each rule or fact has one canonical home, and other documents link to it instead of repeating it.

## Reading order

1. [Working instructions](../AGENTS.md) — mandatory project rules and quality gates.
2. [Master plan](./PLAN.md) — product scope, phases, risks, and approved decisions.
3. [UI rules](./UI_RULES.md) — behavioral UI contracts and the new-control checklist.
4. [UI map](./UI_MAP.md) — shell regions, subregions, and ownership.
5. [Design system](./DESIGN_SYSTEM.md) — visual language, tokens, component inventory, visual QA.
6. [Architecture](./ARCHITECTURE.md) — runtime boundaries, DCEL, rendering, input, and platform.
7. [Persistence](./PERSISTENCE.md) — autosave journal and the `.lpoly` format.
8. [Phase 4 texturing](./PHASE4_TEXTURING.md) — texture/UV implementation slices and gates.
9. [Root README](../README.md) — product overview, setup, and current capabilities.

## Document ownership

| Document | Owns | Does not own |
|---|---|---|
| [Working instructions](../AGENTS.md) | Mandatory engine, persistence, UI-consistency, and quality rules | Component inventories or visual tokens |
| [Master plan](./PLAN.md) | Scope, phases, exits, risks, approved decisions | Implementation detail |
| [UI rules](./UI_RULES.md) | Action homes, selection contracts, shared row/naming/action/tooltip behavior, new-control checklist | Tokens, spacing values, component visuals |
| [UI map](./UI_MAP.md) | Shell regions, subregions, Inspector section sets, active-editor rules | Interaction behavior |
| [Design system](./DESIGN_SYSTEM.md) | Tokens, typography, surfaces, layout, component shapes, visual QA | A second copy of UI behavior rules |
| [Architecture](./ARCHITECTURE.md) | Code boundaries, DCEL, commands, rendering, picking, platform | Product scope or visual styling |
| [Persistence](./PERSISTENCE.md) | Autosave, journal patches, `.lpoly` format, filesystem boundary | UI behavior |
| [Phase 4 texturing](./PHASE4_TEXTURING.md) | Texture/UV slices, data rules, format implications, memory/verification gates | General UI or document architecture |
| [Root README](../README.md) | Product overview and quick start | Canonical rules or format specifications |

## Canonical cross-links

- UI behavior: [UI rules](./UI_RULES.md), especially [Shared UI contracts](./UI_RULES.md#9-shared-ui-contracts).
- Visual tokens and component shapes: [Design system](./DESIGN_SYSTEM.md).
- Shell regions: [UI map](./UI_MAP.md).
- Autosave and file format: [Persistence](./PERSISTENCE.md).

## Maintenance rules

- **One owner.** Add a rule to its owning document, then link to it from summaries. Do not paste the same rule into README, AGENTS, and the design system.
- **TOC for long documents.** Every document longer than ~100 lines has a top-level Contents block. Update it when adding or renaming a top-level section.
- **No append-only sections.** Insert content into the correct section. If a section grows into a distinct topic, promote it to a top-level section with a heading, not a numbered fragment like `8.1`.
- **Cross-reference, don’t duplicate.** Prefer `[UI rules §9](./UI_RULES.md#9-shared-ui-contracts)` over a second prose copy.
- **Changing behavior changes docs.** A UI-visible change updates the owning contract and its screenshots if visuals changed.
- **Keep indexes current.** Add new docs to this index and to the README “Planning and architecture” table.
- **Documentation is acceptance work.** A feature with stale or contradictory docs is not complete.
