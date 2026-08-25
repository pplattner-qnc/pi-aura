---
name: Digest Dashboard
description: Stable single-screen daily briefing of what needs your attention in Aura.
colors:
  base-100: "oklch(100% 0 0)"
  base-200: "oklch(98% 0 0)"
  base-300: "oklch(95% 0 0)"
  base-content: "oklch(21% 0.006 286)"
  primary: "oklch(45% 0.24 277)"
  primary-content: "oklch(93% 0.034 273)"
  secondary: "oklch(65% 0.241 354)"
  secondary-content: "oklch(94% 0.028 342)"
  accent: "oklch(77% 0.152 182)"
  accent-content: "oklch(38% 0.063 188)"
  neutral: "oklch(14% 0.005 286)"
  neutral-content: "oklch(92% 0.004 286)"
  info: "oklch(74% 0.16 233)"
  info-content: "oklch(29% 0.066 243)"
  success: "oklch(76% 0.177 163)"
  success-content: "oklch(37% 0.077 169)"
  warning: "oklch(82% 0.189 84)"
  warning-content: "oklch(41% 0.112 46)"
  error: "oklch(71% 0.194 13)"
  error-content: "oklch(27% 0.105 12)"
typography:
  display:
    fontFamily: '"Bricolage Grotesque", ui-sans-serif, system-ui, sans-serif'
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: '"Bricolage Grotesque", ui-sans-serif, system-ui, sans-serif'
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: '"Bricolage Grotesque", ui-sans-serif, system-ui, sans-serif'
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  table-cell:
    fontFamily: '"Bricolage Grotesque", ui-sans-serif, system-ui, sans-serif'
    fontSize: "14px"
    fontWeight: 400
  label:
    fontFamily: '"Bricolage Grotesque", ui-sans-serif, system-ui, sans-serif'
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.06em"
rounded:
  box: "16px"
  selector: "8px"
  field: "4px"
spacing:
  base: "0.25rem"
  card-pad: "24px"
components:
  card:
    backgroundColor: "{colors.base-100}"
    textColor: "{colors.base-content}"
    rounded: "{rounded.box}"
    padding: "24px"
  card-ring:
    backgroundColor: "{colors.base-100}"
    rounded: "{rounded.box}"
  btn-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.base-content}"
    rounded: "{rounded.field}"
    padding: "8px 12px"
  badge-error:
    backgroundColor: "{colors.error}"
    textColor: "{colors.error-content}"
    rounded: "{rounded.selector}"
  badge-warning:
    backgroundColor: "{colors.warning}"
    textColor: "{colors.warning-content}"
    rounded: "{rounded.selector}"
  badge-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-content}"
    rounded: "{rounded.selector}"
---

# Design System: Digest Dashboard

## Overview

**Creative North Star: "The Confident Morning Briefing"**

A calm, scannable operations console with a clear point of view — a step quieter than a loud dashboard, a step more present than a bare table. Neutral surfaces carry the load; a single committed accent and tighter typographic hierarchy give the briefing a voice. Density is honest (this surface packs a full day's state into one viewport), but the density is ordered, not cluttered. The aim is "between quiet ops console and confident briefing": a stable, reliable briefing the user can scan in one glance, that still feels considered rather than assembled from defaults.

The incumbent is daisyUI v5's default `light` theme over Tailwind v4, with **Bricolage Grotesque** as the sole typeface and emoji-led status badges. It works but reads as unconfigured scaffolding: violet primary, rainbow semantic badges, and uniform `rounded-2xl` cards flatten the hierarchy. The refinement keeps the stack and component structure and tightens the visual layer — a custom daisyUI theme with a single committed accent, calmer status color, and sharper hierarchy — without redesigning from scratch.

**Key Characteristics:**
- One screen, one glance: the whole briefing fits a single viewport; depth lives in scroll, not navigation.
- Stable over fresh: the surface structure is the constant the Aura UI is not.
- Reading leads, acting follows: scannable comprehension first; the action loopback is lightweight, not the centerpiece.
- Scannable density: tabular where it aids comparison, ordered where it doesn't.
- Refinement, not reinvention: improve the incumbent identity in place.

## Colors

A single committed accent on calm neutral surfaces; semantic status colors kept but tuned to read as a family, not a rainbow.

### Primary
- **Indigo-Violet** (`oklch(45% 0.24 277)`): the single brand accent. Used on the active/committed state — the "Working…" badge, the active suggested-action button, and the numbered action badge. Its rarity is the point.

### Neutral
- **Paper** (`oklch(100% 0 0)`, base-100): primary card surface and page base.
- **Mist** (`oklch(98% 0 0)`, base-200): elevated inlay (the summary blockquote) and tonal layering.
- **Fog** (`oklch(95% 0 0)`, base-300): dividers and the table's committed-total row border.
- **Ink** (`oklch(21% 0.006 286)`, base-content): all body and heading text.

### Semantic (status family)
- **Alert Red** (`oklch(71% 0.194 13)`, error): overdue.
- **Signal Amber** (`oklch(82% 0.189 84)`, warning): waiting-on-you and capacity-over.
- **Calm Blue** (`oklch(74% 0.16 233)`, info): waiting-on-others.
- **Safe Green** (`oklch(76% 0.177 163)`, success): approved reviews.

**The One-Accent Rule.** The primary accent is used on ≤10% of any given screen — only the single active state and the numbered action badge. Status badges carry their own semantic color; they never borrow the accent. This keeps the accent meaningful and the status family legible as a family, not a competing palette.

**The Status-Is-Never-Rainbow Rule.** The four semantic colors read as a calibrated family (red → amber → blue → green, matched in chroma and lightness), not as a grab-bag. Where a status dot and a status badge appear together, they share the same hue.

## Typography

**Display & Body Font:** Bricolage Grotesque (with `ui-sans-serif, system-ui, sans-serif`)
**Label Font:** same — Bricolage Grotesque, uppercase + tracked.

**Character:** A single grotesque across all roles — a slightly humanist, confident sans with a touch of quirk in heavier weights. The pairing logic is *weight and size contrast*, not family contrast. Relying on one family keeps the briefing quiet; the hierarchy comes from weight (700/600/400) and size jumps, not from switching faces.

### Hierarchy
- **Display** (700, 30px, line-height 1.1, letter-spacing -0.025em): the date heading only. `tracking-tight` on the h1.
- **Headline** (600, 18px, line-height 1.3, letter-spacing -0.01em): section titles — "Summary", "Needs your attention", "Today's queue".
- **Body** (400, 16px, line-height 1.5): the summary blockquote and list item text.
- **Table cell** (400, 14px): queue rows; `tabular-nums` on numeric columns.
- **Label** (600, 11px, letter-spacing 0.06em, UPPERCASE): the eyebrow labels over each attention group ("OVERDUE", "WAITING ON YOU") and table column headers. The uppercase tracking is what separates label from body at this size.

**The One-Family Rule.** Never introduce a second typeface to signal hierarchy. Hierarchy is weight + size + case; a serif or mono accent belongs to a redesign, not a refinement.

## Layout

A pinned single-viewport shell: `h-screen overflow-hidden` root, content in a `max-w-7xl mx-auto flex flex-col`. The main area is a 2-column grid on `lg` (left: Summary + Attention stacked; right: Queue), collapsing to 1 column below `lg`. A fixed-height tabbed panel docks at the bottom (`h-[35%]`). Scrolling is per-section (`overflow-auto`), not page-level — the shell never scrolls.

Spacing rhythm is Tailwind's `0.25rem` base (`--spacing`): gaps of `4` (1rem) between cards and grid tracks, card padding of `6` (1.5rem, 24px), tight `0.5` between list items. Density is high but ordered: the queue table is the densest element and earns `table-sm`; cards breathe at `p-5 sm:p-6`.

**The Pin-The-Viewport Rule.** The shell stays pinned; sections scroll internally. Page-level scroll breaks the "one glance" promise.

## Elevation & Depth

Flat-by-default with a hairline ring: each card uses a `1px` `ring-base-200` (the daisyUI `ring-1 ring-base-200` recipe) plus the daisyUI default `shadow-sm`. Depth is conveyed by **tonal layering** (base-100 surface on a base-200/transparent page) and the hairline, not by heavy shadows. The only lifted element is the dismissible warning toast (`shadow-lg`, fixed bottom-right).

**The Hairline-Not-Shadow Rule.** Cards separate with a 1px ring on base-200 plus `shadow-sm`. Larger shadows are reserved for transient overlays (toasts); resting surfaces stay flat.

## Shapes

Consistently rounded, but the radius is *stratified by role*, not uniform: boxes/cards at `rounded-2xl` (16px, `--radius-box`), badges and the tab bar at `rounded-lg` (8px, `--radius-selector`), inputs and buttons at `rounded-md` (4px, `--radius-field`). The current surface over-uses `rounded-2xl`; the refinement reserves 16px for container cards and uses 8px for chips/badges so the rounding reads as deliberate.

**The Radius-By-Role Rule.** Container = 16px, chip/badge/tab = 8px, control = 4px. Don't round everything the same; the stratification is the form language.

## Components

### Cards / Containers
- **Shape:** 16px radius (`rounded-2xl`).
- **Background:** base-100.
- **Depth:** `ring-1 ring-base-200` + `shadow-sm`; no border.
- **Padding:** `p-5 sm:p-6` (20–24px).

### Badges (status)
- **Style:** `badge badge-lg` + the semantic color (`badge-error`, `badge-warning`, `badge-info`, `badge-neutral`); 8px radius.
- **Content:** an emoji glyph (`🔴 🟡 🔵 🟢`) as the badge content, `aria-hidden`. The refinement keeps emoji as the quick-scan signal but may pair them with a tonal badge fill for redundancy.

### Buttons
- **Primary action:** `btn btn-ghost w-full justify-start`, with a numbered `badge badge-primary badge-sm` rank and the action label. Active state: `btn-active` + a `loading-spinner` + a `badge-soft badge-primary` "Working…" badge; other actions become `btn-disabled`.
- **Dismiss:** `btn btn-ghost btn-xs` with an inline SVG X.
- **Radius:** 4px (`--radius-field`).

### Table (queue)
- `table table-sm`, uppercase tracked `text-xs` column headers in `text-base-content/60`, `tabular-nums` on numeric columns, a `border-t-2 border-base-300` committed-totals row in `font-semibold`.

### Tabs
- `tabs tabs-boxed`; active tab uses `tab tab-active`. 8px radius on the box.

### Summary blockquote
- `bg-base-200/60 rounded-lg px-4 py-3` — the one tonal inlay, slightly recessed from the card surface.

## Do's and Don'ts

### Do:
- **Do** keep all styling in daisyUI utility classes and a custom daisyUI theme — never inline `style=""` for something a daisyUI component or utility expresses.
- **Do** keep the primary accent on ≤10% of the screen: the single active state and the numbered action badge only.
- **Do** stratify corner radius by role: 16px containers, 8px chips/badges/tabs, 4px controls.
- **Do** use `tabular-nums` on every numeric column (capacity %, hours, rank, version).
- **Do** keep the viewport pinned; sections scroll internally, never the page.

### Don't:
- **Don't** introduce a second typeface; hierarchy is weight + size + case within Bricolage Grotesque.
- **Don't** borrow the primary accent for status — status uses its own semantic color family.
- **Don't** replace the emoji status glyphs with the accent color; they're the quick-scan signal.
- **Don't** round everything to 16px; uniform rounding flattens the form language.
- **Don't** redesign the component structure or swap the stack — refine the visual layer in place.
