---
kind: task
type: research
slug: pi-autocomplete-async-constraints
title: Can pi's autocomplete provider support async stale-then-refresh (SWR) suggestions?
map: unified-reference-mentions
status: done
blocked_by: []
---

## Question

Can a pi autocomplete provider render cached suggestions instantly and then
re-render/override the suggestion pane once a slower Aura fetch resolves?
If the pane cannot be re-rendered for the current keystroke, what is the
best achievable approximation (e.g. fresh results landing on the next
keystroke, `force` re-query, abort-signal semantics under rapid typing)?

## Unblocks

The autocomplete architecture decision for the shared reference engine:
whether the stale-while-revalidate design is implemented as "re-render on
fetch resolution" or "cache-first render, fresh results appear on next
keystroke". This determines the engine's provider contract and how the
sqlite cache and live fetch race.

## Trusted sources

- `node_modules/@earendil-works/pi-tui/dist/autocomplete.d.ts` and the
  compiled `autocomplete.js` in this repo's node_modules (authoritative for
  the installed pi version).
- pi source/docs for `ctx.ui.addAutocompleteProvider` and the
  `GetSuggestionsOptions` (`signal`, `force`) semantics.
- The existing providers in `extensions/aura-tasks.ts` and
  `extensions/engineering-rules.ts` as working examples.

## Evidence required

- A written answer naming the exact mechanism (or its absence) for
  re-rendering suggestions after an async resolution, citing the pi-tui
  source lines.
- The abort-signal contract: when is `signal` aborted, must providers
  respect it, what happens to late resolutions.
- The debounce/trigger behavior of the autocomplete pane (per keystroke?
  trigger characters only?).
- A recommendation: re-render in place vs next-keystroke freshness, with
  the provider contract that follows from it.

## Likely dependents

- The feature tickets for the shared reference engine's autocomplete layer
  (created by to-tickets after the map's decisions collapse).

## Findings (evidence: node_modules/@earendil-works/pi-tui/dist/components/editor.js)

**No in-place re-render exists.** The editor renders suggestions exactly
once per request, when `getSuggestions` resolves
(`runAutocompleteRequest`, editor.js:1896-1931). There is no API for a
provider to push updated items into an open pane afterwards. A provider
cannot re-render for the current keystroke.

**One request per keystroke, serialised.** Each text change calls
`requestAutocomplete`, which cancels the pending request
(`cancelAutocompleteRequest`: bumps `autocompleteStartToken`, clears the
debounce timer, aborts the previous `AbortController`, editor.js:1939+) and
starts a new one. Requests are chained through `autocompleteRequestTask`
so at most one provider call is in flight at a time
(`startAutocompleteRequest`, editor.js:1851-1870).

**Late resolutions are dropped, not applied.** After `getSuggestions`
resolves, `isAutocompleteRequestCurrent` (editor.js:1933-1938) requires:
not aborted, still the latest requestId, and the editor text AND cursor
line/col unchanged since the request started. Any of those failing means
the result is silently discarded. So a slow fetch resolving after the user
kept typing never clobbers the pane.

**Debounce: 20 ms, only in attachment-like contexts.**
`ATTACHMENT_AUTOCOMPLETE_DEBOUNCE_MS = 20` (editor.js:169) applies when the
text before the cursor matches the debounce pattern: an `@` token or any
trigger-character token at a word boundary (editor.js:177-180). Explicit
Tab and `force` requests skip debouncing entirely.

**Abort-signal contract.** The editor aborts the signal when the request
is superseded (new keystroke) or the pane is cancelled. Providers must
check `options.signal.aborted` before returning expensive results (the
existing aura-tasks provider already does) and should pass it into any
fetch. Late returns are safe (dropped by the currency check) but waste
work.

**`force` semantics.** `force: true` is passed for explicit Tab
completion; the editor then consults `shouldTriggerFileCompletion` before
even calling the provider, and auto-applies the suggestion inline when
exactly one item comes back (editor.js:1908-1922).

## Answer and recommendation

SWR as "re-render the open pane when the Aura fetch lands" is **not
possible** with the current pi-tui API. The achievable approximation is
**cache-first render, fresh results on next keystroke**:

1. `getSuggestions` returns fast from the sqlite cache (stale allowed), so
   the pane renders instantly.
2. The same call kicks off the live Aura fetch in the background
   (fire-and-forget, guarded by the request's abort signal); when it
   resolves it writes through to the cache.
3. The user's next keystroke triggers a fresh request (20 ms debounce),
   which reads the now-updated cache and shows fresh results.

In practice typing is continuous, so fresh results appear one keystroke
late, which matches the user's stated requirement ("stale title for a
second, then it becomes updated"). The provider contract for the shared
reference engine follows directly: `getSuggestions` must never await the
Aura fetch; the cache read is the only synchronous data source; live
fetches are side effects.
