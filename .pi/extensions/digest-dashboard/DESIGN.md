# Digest Dashboard — Design

The interactive Aura digest dashboard at `.pi/extensions/digest-dashboard/Digest.svelte`.
Mode: **Operate** — the visitor (a developer starting their day) completes a
task: decide what to act on and click. Scanability, consistency, and the real
usage scene outrank expression.

## Information architecture

1. **Today's priorities** (hero) — the `actions[]` list, the dashboard's
   signature affordance. Top of the page because the user's primary goal is
   "decide what to do and act." The first action is a filled primary button;
   the rest are outline. Clicking bridges page→agent.
2. **Attention** (hero) — overdue / waiting on you / waiting on others /
   notifications. The "look here first" context for the priorities.
3. **Queue / Capacity / Reviews / Reviews owed** (body) — the supporting data.
4. **Corrections / Warnings** (secondary) — informational, smaller headings.

When everything is empty, an **all-clear banner** ("You're all caught up —
nothing needs you right now.") replaces the priorities section.

## Interaction model

- One action at a time. On click, the agent sets
  `followup.currentlyWorkingOn` in `~/.pi/aura/digest.json`; the matching
  button shows a spinner + a visible **"Working…"** tag (not a tooltip) and
  the other buttons disable with an `aria-disabled` + a "paused" caption.
- The agent writes an `ack` event to `~/.pi/aura/state.json` and clears
  `currentlyWorkingOn`; the server's `fs.watch` + SSE hot-reloads the page
  (buttons re-enable). No separate notify step.
- Teardown: `/digest-dashboard stop` (kills the detached server + deletes
  `state.json`/`server-url.json`; the listener observes deletion and exits).

## Design tokens

All colors/spacing/type are CSS custom properties on `:root` (see the
`<style>` block). Semantic names — `--color-accent`, `--color-danger`,
`--color-surface-raised`, `--space-section`, `--font-size-h2`, etc. — so the
dashboard can be themed / dark-moded by overriding the tokens. The blue
accent (`--color-accent`) is reserved for the **active/primary action state**
only; issue keys use `--color-text-secondary` so "actionable" reads
unambiguously.

## Accessibility commitments

- `:focus-visible` ring (2px accent, 2px offset) on action buttons.
- Disabled buttons use `--color-disabled-bg`/`--color-disabled-fg` tokens
  (WCAG AA contrast), not `opacity` (which failed 4.5:1).
- `prefers-reduced-motion` disables the spinner + the utilization-bar
  transition.
- Loading state is an ARIA live region; the queue table has a `<caption>`
  (visually hidden) + `scope="col"` headers.
- Empty states use positive framing ("Nothing overdue", "No reviews pending").

## Open design gaps

- No dark mode (tokens make it additive — override `:root` in a
  `prefers-color-scheme: dark` block).
- No iconography / Aura branding (specificity scored 2/5 in the critique);
  a future `/impeccable shape` pass could ground the visual language in Aura.
- The browser-detector pass (Assessment B) couldn't run (puppeteer not in the
  env); a future run with a browser would catch computed-style issues
  (contrast, cramped padding, tiny text) the source scan can't.
