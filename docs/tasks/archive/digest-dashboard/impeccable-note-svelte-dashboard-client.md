### Impeccable Handoff: svelte-dashboard-client

The implementation created bare-minimum functional UI for this slice.
The following surfaces are ready for design refinement:

#### Surfaces
- `.pi/extensions/digest-dashboard/Digest.svelte`: The complete digest dashboard SPA component (~464 lines). Contains the full markup (sections for Attention, Queue, Capacity, Reviews, Reviews Owed, Corrections, Warnings, Actions) plus an embedded `<style>` block with all current CSS — the spinner, action buttons, data table, and section layout all live here.
- `.pi/extensions/digest-dashboard/main.ts`: Vite browser entry that mounts `Digest` into `#app`. No visual styling itself, but is the mount point for the dashboard.
- `.pi/extensions/digest-dashboard/live/index.html`: Dev-only HTML shell with a fetch shim for `/api/digest` and `/api/state`. No styling beyond the bare `#app` container; serves the component during `npm run live` iteration.
- `.pi/extensions/digest-dashboard/dist/app.css`: Build artifact (Svelte-scoped CSS compiled from the `<style>` block). Not a source file — changes should target `Digest.svelte`'s `<style>` block, not this file.

#### Suggested commands
- `/impeccable critique .pi/extensions/digest-dashboard/Digest.svelte` — Broad evaluation of the whole dashboard: information hierarchy, visual density, and whether the layout serves a scannable daily digest well. This is the highest-leverage single command since everything lives in one component.
- `/impeccable layout .pi/extensions/digest-dashboard/Digest.svelte` — The attention grid (`auto-fit, minmax(14rem, 1fr)`) and the single-column stacked sections are functional but not optimized for a data dashboard. Section spacing, the queue table's column proportions, and the responsive breakpoint behavior at narrow widths need deliberate layout work.
- `/impeccable typeset .pi/extensions/digest-dashboard/Digest.svelte` — Heading sizes (1.5rem h1, 1.125rem h2, 0.875rem h3) and the monospace `.key` styling are bare defaults. The summary line, capacity inline metrics, and table typography would benefit from a coherent type scale and better information density.
- `/impeccable harden .pi/extensions/digest-dashboard/Digest.svelte` — The action buttons' disabled/active states, the spinner + "continue in pi" affordance (`title` attribute), and the error/loading states are minimally styled. Interaction states, focus rings, and empty-state messaging deserve a hardening pass for robustness and accessibility.

#### Notes
- The dashboard renders data from `digest.json` (sections: Attention, Queue, Capacity, Reviews, Reviews Owed, Corrections, Warnings, Actions) with action buttons that POST to `/api/state` via SSE-triggered refresh.
- Currently bare-bones functional: no design system, no dark-mode support, no intentional spacing rhythm. The embedded `<style>` block uses raw CSS values (`#1a1a1a`, `#e5e5e5`, etc.) with no design tokens or CSS variables.
- What's missing visually: consistent spacing rhythm across sections, a deliberate color palette beyond ad-hoc hex values, responsive layout tuning (the `auto-fit` grid collapses but column choices aren't intentional), typography hierarchy refinement, and polish on the spinner/"continue in pi" affordance (currently just a `title` tooltip on an active button).
- The action button affordance: when an action is the `currentlyWorkingOn` match, it gets a spinner and a `title="continue in pi"`; non-active actions are disabled. This interaction pattern is functional but visually underdeveloped — the disabled state (`opacity: 0.55`) and active state (blue border/bg) are minimal.
- `dist/app.css` and `dist/app.js` are committed build artifacts. Design changes should be made in `Digest.svelte`'s `<style>` block and markup, then rebuilt. Do not edit `dist/` files directly.
- `live/index.html` is a dev shim only — its only styling concern is the bare `#app` container; real visual work targets the Svelte component.
- The component uses Svelte 5 runes (`$state`, `$derived`, `$effect`) — any refinements must be compatible with Svelte 5 syntax.
