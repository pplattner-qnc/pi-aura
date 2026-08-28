<script lang="ts">
  import type {
    Digest,
    DigestAction,
    DigestAttentionItem,
    DigestCapacity,
    DigestCorrection,
    DigestFollowup,
    DigestNotifications,
    DigestQueueRow,
    DigestReview,
    DigestReviewOwed,
    TaskDevLinks,
    DevLinkPullRequest,
    DevLinkBranch,
    StateEvent,
    ProgressPayload,
    AgentLogPayload,
  } from "./digest-types.ts";
  import {
    extractProgressEvents,
    extractAgentLogEvents,
    mergeProgressNodes,
    buildProgressTree,
    effectiveStatus,
    createDebounce,
    createDwellManager,
    isRootDone,
    DWELL_MS,
    type ProgressNode,
    type NodeStatus,
  } from "./progressTree.ts";

  // --- State ---
  let digest = $state<Digest | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // --- Fetch display mode (slice 4) ---
  // When progress events are present and the root fetch node is not yet
  // done, the dashboard shows a live progress tree instead of the digest
  // view. Once the root node is terminal (done) AND digest.json is
  // available, the view transitions to the existing digest render.
  let fetchMode = $state(false);
  let progressNodes = $state<Map<string, ProgressNode>>(new Map());
  let agentLogLines = $state<string[]>([]);

  // Dwell manager: holds a running->done (or running->error) transition for
  // ~400ms so a fast open->close pair still shows a brief check/X rather
  // than vanishing. Only applies to an OBSERVED transition — a node already
  // terminal when first mounted renders immediately.
  // dwellVersion is a reactive counter bumped by the dwell manager's
  // onExpire callback so that when a dwell timer fires (mutating the
  // manager's internal, non-reactive Map) the component re-renders and
  // picks up the now-expired dwell state.
  //
  // The scheduler defers the dwell expiry timer to the next animation frame
  // so the dwell duration is measured from the first visible render, not
  // from when the data arrives (which is earlier due to the 30ms debounce).
  // The dwelling flag is set immediately in observe() so the current render
  // shows the spinner; the setTimeout that clears the flag is started from
  // the rAF callback. A small buffer (half the rAF delay, rounded) is added
  // to the setTimeout duration to compensate for the rAF deferral so the
  // effective dwell is ~400ms from the user's perspective.
  let dwellVersion = $state(0);
  let dwell = createDwellManager(
    DWELL_MS,
    () => { dwellVersion++; },
    (fn, ms) => {
      const observeTime = Date.now();
      requestAnimationFrame(() => {
        const rafDelay = Date.now() - observeTime;
        setTimeout(fn, ms + Math.round(rafDelay / 2));
      });
    },
  );

  type TabId = "capacity" | "reviews-due" | "reviews-owed" | "actions";
  let activeTab = $state<TabId>("actions");
  let dismissedWarnings = $state<Set<number>>(new Set());

  async function loadDigest() {
    try {
      const res = await fetch("/api/digest");
      if (!res.ok) {
        throw new Error(`Error loading digest: ${res.status} ${res.statusText}`);
      }
      const data: Digest = await res.json();
      digest = data;
      error = null;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      digest = null;
    } finally {
      loading = false;
    }
  }

  async function postAction(action: DigestAction) {
    const event: StateEvent = {
      id: Date.now(),
      ts: new Date().toISOString(),
      dir: "page→agent",
      type: "action_click",
      payload: action,
    };
    try {
      await fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });
    } catch (err) {
      console.error("Failed to post action_click:", err);
    }
  }

  function actionKey(action: DigestAction): string {
    return `${action.section}/${action.key}`;
  }

  function isValidAction(value: unknown): value is DigestAction {
    if (!value || typeof value !== "object") return false;
    const a = value as Partial<DigestAction>;
    return (
      typeof a.section === "string" &&
      typeof a.key === "string" &&
      typeof a.action === "string" &&
      typeof a.label === "string" &&
      typeof a.instruction === "string" &&
      typeof a.aura_use_case === "string"
    );
  }

  let filteredActions = $derived(
    (digest?.actions ?? []).filter((a): a is DigestAction => {
      if (isValidAction(a)) return true;
      console.warn("Skipping malformed digest action:", a);
      return false;
    }),
  );

  let visibleWarningIndices = $derived(
    (digest?.warnings ?? []).map((_, i) => i).filter((i) => !dismissedWarnings.has(i)),
  );

  // Which queue task cards have their details pane expanded (live preview).
  let expandedTasks = $state<Set<string>>(new Set());
  function toggleTask(key: string): void {
    if (expandedTasks.has(key)) {
      expandedTasks.delete(key);
      expandedTasks = new Set(expandedTasks);
    } else {
      expandedTasks = new Set([...expandedTasks, key]);
    }
  }
  function devLinksFor(key: string): TaskDevLinks | undefined {
    return (digest?.dev_links ?? []).find((d) => d.task_key === key);
  }

  let followup = $derived<DigestFollowup>(digest?.followup ?? { currentlyWorkingOn: null });
  let workingKey = $derived(followup.currentlyWorkingOn);
  let hasWorkingMatch = $derived(filteredActions.some((a) => actionKey(a) === workingKey));

  // --- Mount effects ---
  // Initial load on mount. (Svelte 5 has no onMount in runes mode; $effect runs
  // post-mount. We guard with a `started` flag so strict-mode double-invocation
  // doesn't fire two competing loads.)
  let started = $state(false);
  $effect(() => {
    if (started) return;
    started = true;
    loadDigest();
  });

  // Fetch the full state.json and accumulate progress + agent_log events.
  // Called on SSE connect (residual risk: the state.json watcher swallows
  // ENOENT if the file is absent at connect time) and on each state-change
  // event (the SSE carries only the last event id+type — a hint, not a full
  // delta — so the browser re-fetches the full state.json each time).
  async function loadStateEvents(): Promise<void> {
    try {
      const res = await fetch("/api/state");
      if (!res.ok) return;
      const data = await res.json();
      const events: StateEvent[] = data?.events ?? [];
      const progressEvents = extractProgressEvents(events);
      const logEvents = extractAgentLogEvents(events);
      if (progressEvents.length > 0 || logEvents.length > 0) {
        // Accumulate progress nodes (append-only by id).
        const merged = mergeProgressNodes(progressNodes, progressEvents);
        progressNodes = new Map(merged);
        // Accumulate agent log lines (chronological, dedup by content+order).
        const newLines = logEvents.map((e) => e.message);
        // Only add lines we haven't seen (compare against the accumulated set).
        for (const line of newLines) {
          if (!agentLogLines.includes(line)) {
            agentLogLines = [...agentLogLines, line];
          }
        }
        fetchMode = true;
      }
      // Check if we should transition to the digest view.
      maybeTransitionToDigest();
    } catch {
      // Best-effort: state.json fetch failure is non-fatal.
    }
  }

  // Transition from fetch mode to the digest view when the root node is
  // terminal (done) and digest.json is present. We re-fetch /api/digest to
  // check availability, then switch the view.
  async function maybeTransitionToDigest(): Promise<void> {
    if (!fetchMode) return;
    const tree = buildProgressTree(progressNodes);
    if (!isRootDone(tree)) return;
    // Root is done — check if digest.json is available.
    try {
      const res = await fetch("/api/digest");
      if (res.ok) {
        const data: Digest = await res.json();
        digest = data;
        error = null;
        loading = false;
        fetchMode = false;
      }
      // If digest.json is not yet present, stay in fetch mode.
    } catch {
      // Stay in fetch mode — will retry on next state-change.
    }
  }

  // Debounce for state-change events: rapid bursts coalesce into one fetch.
  // ~30ms coalescing window (layered debounce layer 1).
  let stateDebounce = createDebounce(() => {
    void loadStateEvents();
  }, 30);

  // Hot-reload via SSE. Kept separate from the initial load so a slow initial
  // fetch isn't raced by an onmessage re-fetch. The SSE now emits two named
  // events: "change" (digest.json changed) and "state-change" (state.json
  // changed — progress/agent_log events). On connect, we also re-fetch
  // state.json (residual risk: the watcher may have swallowed ENOENT).
  $effect(() => {
    const source = new EventSource("/events");
    source.onmessage = () => loadDigest();
    source.onerror = (err) => console.error("EventSource error:", err);
    // Re-fetch state.json on connect (the watcher may have missed the file
    // if it was absent at SSE-connect time).
    void loadStateEvents();
    // digest.json changed — re-fetch the digest.
    source.addEventListener("change", () => {
      loadDigest();
    });
    // state.json changed — coalesce and re-fetch state events.
    source.addEventListener("state-change", () => {
      stateDebounce.trigger();
    });
    return () => {
      source.close();
      stateDebounce.cancel();
      dwell.cancel();
    };
  });

  // --- Section helpers ---
  function fmtPct(n: number | null): string {
    return n == null ? "—" : `${n}%`;
  }

  const WORKDAY_HOURS = 8;

  function fmtHours(hours: number | null): string {
    if (hours === null) return "—";
    const rounded = Math.round(hours / 0.25) * 0.25;
    const h = Math.floor(rounded);
    const m = Math.round((rounded - h) * 60);
    return `~${h}:${String(m).padStart(2, "0")}`;
  }

  function decisionEmoji(d: { decided: boolean; decision: string }): string {
    if (!d.decided) return "⏳";
    const dec = d.decision.toUpperCase();
    if (dec === "APPROVED") return "✅";
    if (dec === "REJECTED" || dec === "NEEDS_REVISION") return "❌";
    return "•";
  }

  function stateEmoji(state: string): string {
    const s = state.toUpperCase();
    if (s === "OPEN") return "🟢";
    if (s === "MERGED") return "✅";
    if (s === "CLOSED" || s === "DECLINED") return "⚫";
    return "•";
  }

  // Collect reviewer first-names across ALL reviews, from both decided
  // (decisions) and pending (open_reviews) reviewers, so an assigned
  // reviewer who hasn't decided yet still gets a column.
  function reviewerNames(reviews: DigestReview[]): string[] {
    const names: string[] = [];
    const seen = new Set<string>();
    const add = (fullName: string) => {
      const first = fullName.split(",")[0].trim();
      if (first && !seen.has(first)) {
        seen.add(first);
        names.push(first);
      }
    };
    for (const r of reviews) {
      for (const d of r.decisions) add(d.user_name);
      for (const o of r.open_reviews) add(o.user_name);
    }
    return names;
  }

  function pctToHours(pct: number | null): number | null {
    if (pct === null) return null;
    return (pct * WORKDAY_HOURS) / 100;
  }

  // --- Fetch display mode helpers ---
  // Status icon for a progress node: spinner (running), check (done), X (error).
  // Uses the effective status so a deferred parent stays spinning while
  // children are running. Applies the dwell hold so a fast running->done
  // transition still shows the spinner for ~400ms before flipping to check.
  //
  // Dwell observation happens here, at render time, not in loadStateEvents.
  // This ensures the dwell timer starts when the new status is first
  // rendered, not when the data arrives (which is ~20ms earlier due to the
  // 30ms debounce). Only leaf nodes (no children) are observed for dwell —
  // parent nodes use deferCloseForChildren (effectiveStatus) as their
  // natural hold.
  //
  // Reading dwellVersion creates a reactive dependency so that when the
  // dwell manager's onExpire callback bumps it (a dwell timer fired), this
  // function re-evaluates and the icon updates.
  function statusIcon(node: ProgressNode): string {
    void dwellVersion;
    const status = effectiveStatus(node);
    if (node.children.length === 0) {
      dwell.observe(node.id, status);
    }
    const displayed = dwell.displayStatus(node.id, status);
    if (displayed === "running") return "spinner";
    if (displayed === "done") return "✓";
    return "✕";
  }

  // Parse a notification summary line ("YYYY-MM-DD — <type> by ...") and return
  // the type code plus its emoji badge + plain-English label for the tooltip.
  const NOTIF_META: Record<string, { emoji: string; label: string }> = {
    "task.status_changed": { emoji: "🚦", label: "Task status changed" },
    "task.member_added": { emoji: "👤", label: "Task member added" },
    "task.owner_assigned": { emoji: "🎯", label: "Task owner assigned" },
    "artifact.review_assigned": { emoji: "🔍", label: "Review assigned" },
    "artifact.review_decided": { emoji: "⚖️", label: "Review decided" },
    "artifact.review_completed_approved": { emoji: "✅", label: "Review approved" },
    "artifact.review_completed_needs_revision": { emoji: "❌", label: "Review needs revision" },
    "artifact.review_run_overridden": { emoji: "🔁", label: "Review run overridden" },
    "comment.created": { emoji: "💬", label: "Comment created" },
    "comment.mention": { emoji: "📣", label: "Comment mention" },
    "question.answered": { emoji: "❓", label: "Question answered" },
  };
  const NOTIF_DEFAULT = { emoji: "🔔", label: "Notification" } as const;

  // Normalize a notification entry to its summary line. Accepts the current
  // shape ({ line, type, url }) and the legacy shape (a bare summary string);
  // returns "" for anything unexpected so the renderer never throws on
  // `.split` of undefined. Guards against a stale/malformed digest.json.
  function notifLine(note: unknown): string {
    if (typeof note === "string") return note;
    if (note && typeof note === "object" && "line" in note) {
      const line = (note as { line?: unknown }).line;
      return typeof line === "string" ? line : "";
    }
    return "";
  }
  function notifUrl(note: unknown): string | null {
    if (note && typeof note === "object" && "url" in note) {
      const url = (note as { url?: unknown }).url;
      return typeof url === "string" ? url : null;
    }
    return null;
  }
  function notifType(line: string): string {
    if (!line) return "";
    // Summary format: "YYYY-MM-DD — <type> by ..."
    const rest = line.split(" — ").slice(1).join(" — ");
    return rest.split(" by ")[0].split(": ")[0].trim();
  }
  function notifMeta(line: string): { emoji: string; label: string } {
    return NOTIF_META[notifType(line)] ?? NOTIF_DEFAULT;
  }
  // Strip the leading "YYYY-MM-DD — <type>" prefix from a summary line so the
  // visible text starts at "by <actor>: <target>" (the readable part).
  function notifBody(line: string): string {
    if (!line) return "";
    const rest = line.split(" — ").slice(1).join(" — ");
    return rest.split(" by ").slice(1).join(" by ") || line;
  }
</script>

{#if loading}
  <p class="text-base-content/60 italic">Loading digest…</p>
{:else if fetchMode}
  {@const tree = buildProgressTree(progressNodes)}
  {#snippet treeNode(node: ProgressNode)}
    <li data-node-id={node.id}>
      <div class="flex items-center gap-2 py-1">
        {#if statusIcon(node) === "spinner"}
          <span class="loading loading-spinner loading-xs shrink-0" aria-hidden="true"></span>
        {:else if statusIcon(node) === "✕"}
          <span class="shrink-0 text-error" aria-hidden="true">✕</span>
        {:else}
          <span class="shrink-0 text-success" aria-hidden="true">✓</span>
        {/if}
        <span class="text-sm">{node.label}</span>
      </div>
      {#if node.children.length > 0}
        <ul class="ml-6 flex flex-col gap-1" data-subtree>
          {#each node.children as child (child.id)}
            {@render treeNode(child)}
          {/each}
        </ul>
      {/if}
    </li>
  {/snippet}
  <div class="h-screen overflow-hidden bg-base-100 text-base-content p-4 sm:p-6">
    <div class="h-full max-w-3xl mx-auto flex flex-col gap-4">
      <header class="shrink-0">
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight">Fetching digest…</h1>
      </header>

      <section class="flex-1 min-h-0 overflow-auto" data-progress-tree>
        {#if tree.length === 0}
          <p class="text-base-content/60 italic">Preparing…</p>
        {:else}
          <ul class="flex flex-col gap-1">
            {#each tree as node (node.id)}
              {@render treeNode(node)}
            {/each}
          </ul>
        {/if}
      </section>

      {#if agentLogLines.length > 0}
        <section class="shrink-0 max-h-[35%] overflow-auto border-t border-base-300 pt-3" data-agent-log>
          <h2 class="text-sm font-semibold uppercase tracking-wide text-base-content/70 mb-2">Agent log</h2>
          <ul class="space-y-0.5 text-sm">
            {#each agentLogLines as line, i (i)}
              <li class="text-base-content/80" data-log-line>{line}</li>
            {/each}
          </ul>
        </section>
      {/if}
    </div>
  </div>
{:else if error}
  <p class="text-error">Error: {error}</p>
{:else if digest}
  {@const day = new Date(digest.date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  })}
  {@const staleCorrections = digest.corrections.filter((c) => c.stale)}
  <div class="h-screen overflow-hidden bg-base-100 text-base-content p-4 sm:p-6">
    <div class="h-full max-w-7xl mx-auto flex flex-col gap-4">
      <header class="shrink-0">
        <h1 class="text-3xl sm:text-4xl font-bold tracking-tight">{day}</h1>
      </header>

      <!-- Warnings: dismissible bottom-right toasts -->
      {#if visibleWarningIndices.length > 0}
        <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
          {#each visibleWarningIndices as i (i)}
            <div class="pointer-events-auto alert alert-warning rounded-2xl shadow-lg max-w-sm w-full flex items-start gap-3">
              <span class="text-sm leading-snug flex-1 min-w-0">{digest.warnings[i]}</span>
              <button
                type="button"
                class="btn btn-ghost btn-xs shrink-0"
                aria-label="Dismiss warning"
                onclick={() => dismissedWarnings = new Set([...dismissedWarnings, i])}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
              </button>
            </div>
          {/each}
        </div>
      {/if}

      <main class="flex-1 min-h-0 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div class="flex flex-col gap-4 min-h-0">
          <!-- Summary -->
          <section class="card bg-base-100 shadow-sm ring-1 ring-base-200 rounded-2xl p-5 sm:p-6 min-h-0 shrink-0 overflow-auto max-h-[45%]">
            <h2 class="text-lg font-semibold tracking-tight mb-4">Summary</h2>
            {#if digest.summary}
              <blockquote class="bg-base-200/60 rounded-lg px-4 py-3 text-base text-base-content/80 leading-relaxed">
                {digest.summary}
              </blockquote>
            {:else}
              <p class="text-base-content/60 italic">No summary available.</p>
            {/if}
            {#if staleCorrections.length > 0}
              <div class="mt-4 pt-4 border-t border-base-300">
                <p class="text-xs uppercase tracking-wide text-base-content/70 mb-2">Corrections</p>
                <ul class="space-y-1 text-sm">
                  {#each staleCorrections as correction (correction.artifact_id)}
                    <li>
                      <span class="text-base-content/50">↳</span>
                      {correction.title} — <span class="text-base-content/70">{correction.note}</span>
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}
          </section>

          <!-- Attention -->
          <section class="card bg-base-100 shadow-sm ring-1 ring-base-200 rounded-2xl p-5 sm:p-6 flex-1 min-h-0 overflow-auto">
            <h2 class="text-lg font-semibold tracking-tight mb-4">Needs your attention</h2>
            <div class="space-y-4">
              <div class="flex gap-3 items-start">
                <span class="badge badge-error badge-lg shrink-0" aria-hidden="true">🔴</span>
                <div class="min-w-0">
                  <p class="font-semibold text-sm uppercase tracking-wide text-base-content/70 mb-1">Overdue</p>
                  <ul class="space-y-0.5">
                    {#if digest.attention.overdue.length === 0}
                      <li><p class="text-base-content/60 italic">None</p></li>
                    {:else}
                      {#each digest.attention.overdue as item, i (i)}
                        <li>
                          {#if item.key}{item.key} — {/if}{item.title}
                          {#if item.days}<span class="text-base-content/60">({item.days}d)</span>{/if}
                        </li>
                      {/each}
                    {/if}
                  </ul>
                </div>
              </div>

              <div class="flex gap-3 items-start">
                <span class="badge badge-warning badge-lg shrink-0" aria-hidden="true">🟡</span>
                <div class="min-w-0">
                  <p class="font-semibold text-sm uppercase tracking-wide text-base-content/70 mb-1">Waiting on you</p>
                  <ul class="space-y-0.5">
                    {#if digest.attention.waiting_on_you.length === 0}
                      <li><p class="text-base-content/60 italic">None</p></li>
                    {:else}
                      {#each digest.attention.waiting_on_you as item, i (i)}
                        <li>
                          {#if item.key}{item.key} — {/if}{item.title}
                          {#if item.days}<span class="text-base-content/60">({item.days}d)</span>{/if}
                        </li>
                      {/each}
                    {/if}
                  </ul>
                </div>
              </div>

              <div class="flex gap-3 items-start">
                <span class="badge badge-info badge-lg shrink-0" aria-hidden="true">🔵</span>
                <div class="min-w-0">
                  <p class="font-semibold text-sm uppercase tracking-wide text-base-content/70 mb-1">Waiting on others</p>
                  <ul class="space-y-0.5">
                    {#if digest.attention.waiting_on_others.length === 0}
                      <li><p class="text-base-content/60 italic">None</p></li>
                    {:else}
                      {#each digest.attention.waiting_on_others as item, i (i)}
                        <li>
                          {#if item.key}{item.key} — {/if}{item.title}
                          {#if item.days}<span class="text-base-content/60">({item.days}d)</span>{/if}
                        </li>
                      {/each}
                    {/if}
                  </ul>
                </div>
              </div>

              <div class="flex gap-3 items-start">
                <span class="badge badge-neutral badge-lg shrink-0" aria-hidden="true">📬</span>
                <div class="min-w-0">
                  <p class="font-semibold text-sm uppercase tracking-wide text-base-content/70 mb-1">Since last run</p>
                  <ul class="space-y-0.5">
                    {#if digest.attention.notifications.since_last_run.length === 0}
                      <li><p class="text-base-content/60 italic">Nothing new since last run.</p></li>
                    {:else}
                      {#each digest.attention.notifications.since_last_run as note, i (i)}
                        {@const line = notifLine(note)}
                        {@const m = notifMeta(line)}
                        {@const body = notifBody(line)}
                        {@const url = notifUrl(note)}
                        <li class="text-sm flex items-start gap-1.5">
                          <span class="tooltip tooltip-right shrink-0" data-tip={m.label}>
                            <span class="badge badge-sm border-0 bg-base-200 text-base-content/70" aria-hidden="true">{m.emoji}</span>
                          </span>
                          {#if url}
                            <a class="link link-primary link-hover min-w-0 underline-offset-2" href={url} target="_blank" rel="noreferrer">{body}</a>
                          {:else}
                            <span class="min-w-0">{body}</span>
                          {/if}
                        </li>
                      {/each}
                    {/if}
                  </ul>
                </div>
              </div>

              <div class="flex gap-3 items-start">
                <span class="badge badge-neutral badge-lg shrink-0" aria-hidden="true">📬</span>
                <div class="min-w-0">
                  <p class="font-semibold text-sm uppercase tracking-wide text-base-content/70 mb-1">Older unread</p>
                  <ul class="space-y-0.5">
                    {#if digest.attention.notifications.older_unread.length === 0}
                      <li><p class="text-base-content/60 italic">No unread notifications.</p></li>
                    {:else}
                      {#each digest.attention.notifications.older_unread as note, i (i)}
                        {@const line = notifLine(note)}
                        {@const m = notifMeta(line)}
                        {@const body = notifBody(line)}
                        {@const url = notifUrl(note)}
                        <li class="text-sm flex items-start gap-1.5">
                          <span class="tooltip tooltip-right shrink-0" data-tip={m.label}>
                            <span class="badge badge-sm border-0 bg-base-200 text-base-content/70" aria-hidden="true">{m.emoji}</span>
                          </span>
                          {#if url}
                            <a class="link link-primary link-hover min-w-0 underline-offset-2" href={url} target="_blank" rel="noreferrer">{body}</a>
                          {:else}
                            <span class="min-w-0">{body}</span>
                          {/if}
                        </li>
                      {/each}
                    {/if}
                  </ul>
                </div>
              </div>
            </div>
          </section>
        </div>

        <!-- Queue -->
        <section class="card bg-base-100 shadow-sm ring-1 ring-base-200 rounded-2xl p-5 sm:p-6 flex flex-col min-h-0">
          <h2 class="text-lg font-semibold tracking-tight mb-4 shrink-0">Today's queue</h2>
          <div class="flex-1 min-h-0 overflow-auto">
            {#if digest.queue.length === 0}
              <p class="text-base-content/60 italic">No tasks in the queue.</p>
            {:else}
              {@const committedRows = digest.queue.filter((r) => r.capacity_pct !== null && r.capacity_pct > 0)}
              {@const totalPct = committedRows.reduce((s, r) => s + (r.capacity_pct ?? 0), 0)}
              {@const totalHours = committedRows.reduce((s, r) => s + (r.hours ?? pctToHours(r.capacity_pct) ?? 0), 0)}
              <div class="flex flex-col">
                {#each digest.queue as row (row.key)}
                  {@const dl = devLinksFor(row.key ?? "")}
                  {@const expanded = expandedTasks.has(row.key ?? "")}
                  <div class="flex items-start gap-3 py-3.5 pr-3.5 border-b border-base-200 last:border-b-0">
                    <span class="text-2xl font-bold leading-none text-base-content/30 tabular-nums min-w-[1.5rem] text-right pt-0.5">{row.rank}</span>
                    <div class="flex-1 min-w-0">
                      <p class="font-semibold text-[15px] leading-snug tracking-tight mb-2">
                        {#if row.key}<span class="font-medium text-base-content/50">{row.key} — </span>{/if}{row.title}
                      </p>
                      <div class="flex flex-wrap items-center gap-1.5">
                        <span class="badge badge-sm border-0 bg-base-200 text-base-content/70 font-semibold tracking-wide">{row.status}</span>
                        <span class="badge badge-sm badge-outline border-base-300 text-base-content/60 font-semibold">{row.role}</span>
                        <span class="badge badge-sm border-0 bg-primary/10 text-primary font-semibold">{fmtPct(row.capacity_pct)}</span>
                        <span class="badge badge-sm border-0 bg-transparent text-base-content/70 font-semibold tabular-nums">{fmtHours(row.hours ?? pctToHours(row.capacity_pct))}</span>
                        <button
                          type="button"
                          class="btn btn-ghost btn-xs gap-1 ml-auto text-primary hover:bg-primary/10"
                          aria-expanded={expanded}
                          onclick={() => toggleTask(row.key ?? "")}
                        >
                          <svg viewBox="0 0 12 12" fill="currentColor" class="w-3 h-3 transition-transform duration-150" class:rotate-90={expanded} aria-hidden="true"><path d="M4 2l4 4-4 4"/></svg>
                          Git
                        </button>
                      </div>
                      {#if expanded}
                        <div class="mt-2 p-3 bg-base-200 rounded-lg flex flex-col gap-1.5">
                          {#if dl && (dl.pull_requests.length || dl.branches.length)}
                            {#each dl.pull_requests as pr (pr.id)}
                              <div class="flex items-center gap-2 text-sm">
                                <span class="text-[10px] font-bold uppercase tracking-wider text-base-content/50">PR</span>
                                <a class="link link-primary underline-offset-2" href={pr.url} target="_blank" rel="noreferrer">{pr.id} · {pr.title}</a>
                              </div>
                            {/each}
                            {#each dl.branches as br (br.name)}
                              <div class="flex items-center gap-2 text-sm">
                                <span class="text-[10px] font-bold uppercase tracking-wider text-base-content/50">Branch</span>
                                {#if br.url}
                                  <a class="link link-primary underline-offset-2" href={br.url} target="_blank" rel="noreferrer">{br.name}</a>
                                {:else}
                                  <span class="text-base-content/80">{br.name}</span>
                                {/if}
                                {#if br.last_commit} · <span class="tabular-nums text-base-content/50">{br.last_commit}</span>{/if}
                              </div>
                            {/each}
                          {:else}
                            <p class="text-xs italic text-base-content/40">No git links for this task.</p>
                          {/if}
                        </div>
                      {/if}
                    </div>
                  </div>
                {/each}
                <div class="flex justify-end gap-6 pt-2.5 mt-1 border-t-2 border-base-200 font-semibold text-sm">
                  <span>Committed</span>
                  <span class="tabular-nums">{totalPct}%</span>
                  <span class="tabular-nums">{fmtHours(totalHours)}</span>
                </div>
                <p class="text-xs text-base-content/50 mt-2">8hr workday → hours = capacity% × {WORKDAY_HOURS}, rounded to ¼h</p>
              </div>
            {/if}
          </div>
        </section>
      </main>

      <!-- Bottom tabs -->
      <section class="card bg-base-100 shadow-sm ring-1 ring-base-200 rounded-2xl p-5 sm:p-6 shrink-0 h-[35%] min-h-[180px] max-h-[40%] flex flex-col">
        <div class="tabs tabs-boxed shrink-0 mb-4" role="tablist">
          <button
            type="button"
            role="tab"
            class="tab"
            class:tab-active={activeTab === "capacity"}
            aria-selected={activeTab === "capacity"}
            onclick={() => activeTab = "capacity"}
          >Capacity</button>
          <button
            type="button"
            role="tab"
            class="tab"
            class:tab-active={activeTab === "reviews-due"}
            aria-selected={activeTab === "reviews-due"}
            onclick={() => activeTab = "reviews-due"}
          >Reviews due</button>
          <button
            type="button"
            role="tab"
            class="tab"
            class:tab-active={activeTab === "reviews-owed"}
            aria-selected={activeTab === "reviews-owed"}
            onclick={() => activeTab = "reviews-owed"}
          >Reviews owed</button>
          <button
            type="button"
            role="tab"
            class="tab"
            class:tab-active={activeTab === "actions"}
            aria-selected={activeTab === "actions"}
            onclick={() => activeTab = "actions"}
          >Suggested actions</button>
        </div>

        <div class="flex-1 min-h-0 overflow-auto">
          {#if activeTab === "capacity"}
            <div>
              {#if true}
              {@const c = digest.capacity}
              {@const over = c.over}
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div class="flex flex-col gap-0.5">
                  <span class="text-xs uppercase tracking-wide text-base-content/50">Base</span>
                  <span class="text-lg font-semibold tabular-nums">{c.base_pct}%</span>
                </div>
                <div class="flex flex-col gap-0.5">
                  <span class="text-xs uppercase tracking-wide text-base-content/50">Committed</span>
                  <span class="text-lg font-semibold tabular-nums" class:text-warning={over}>{c.committed_pct}%{#if over} ⚠️{/if}</span>
                </div>
                <div class="flex flex-col gap-0.5">
                  <span class="text-xs uppercase tracking-wide text-base-content/50">Free</span>
                  <span class="text-lg font-semibold tabular-nums">{c.free_pct}%</span>
                </div>
                <div class="flex flex-col gap-0.5">
                  <span class="text-xs uppercase tracking-wide text-base-content/50">Utilization</span>
                  <span class="text-lg font-semibold tabular-nums" class:text-warning={over}>{c.utilization_pct}%{#if over} ⚠️{/if}</span>
                </div>
              </div>
              <p class="text-sm text-base-content/60 mt-3">
                Committed hours: <strong class="text-base-content tabular-nums">{c.total_hours.toFixed(1)}h</strong> / {WORKDAY_HOURS}h workday
              </p>
              {/if}
            </div>
          {:else if activeTab === "reviews-due"}
            <div>
              {#if digest.reviews.length === 0}
                <p class="text-base-content/60 italic">Nothing pending.</p>
              {:else}
                <div>
                  {#if true}
                  {@const names = reviewerNames(digest.reviews)}
                  <div class="overflow-x-auto">
                    <table class="table table-sm w-full">
                      <thead>
                        <tr class="text-base-content/60 text-xs uppercase tracking-wide">
                          <th>Artifact</th>
                          <th>v</th>
                          {#each names as name (name)}
                            <th>{name}</th>
                          {/each}
                        </tr>
                      </thead>
                      <tbody>
                        {#each digest.reviews as review (review.artifact_id)}
                          {@const byName = new Map(review.decisions.map((d) => [d.user_name.split(",")[0].trim(), decisionEmoji(d)]))}
                          {@const pending = new Set(review.open_reviews.filter((o) => !o.decided).map((o) => o.user_name.split(",")[0].trim()))}
                          <tr>
                            <td>{review.title}</td>
                            <td class="tabular-nums text-base-content/50">{review.version}</td>
                            {#each names as name (name)}
                              <td class="text-center" title={pending.has(name) ? "Assigned — review still pending" : ""}>
                                {byName.get(name) ?? (pending.has(name) ? "🔵" : "")}
                              </td>
                            {/each}
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  </div>
                  {/if}
                  <p class="text-xs text-base-content/50 mt-2">
                    <span aria-hidden="true">🔵</span> assigned · <span aria-hidden="true">⏳</span> pending · <span aria-hidden="true">✅</span> approved · <span aria-hidden="true">❌</span> rejected/needs revision
                  </p>
                </div>
              {/if}
            </div>
          {:else if activeTab === "reviews-owed"}
            <div>
              {#if digest.reviews_owed.length === 0}
                <p class="text-base-content/60 italic">None — you're not blocking any reviews.</p>
              {:else}
                <ul class="space-y-1">
                  {#each digest.reviews_owed as review (review.artifact_id)}
                    <li>
                      {review.title}
                      <span class="text-base-content/50 tabular-nums">v{review.version}</span>
                      {#if review.deadline}<span class="text-base-content/60">(due {review.deadline.slice(0, 10)})</span>{/if}
                      {#if review.initiator}<span class="text-base-content/60">— from {review.initiator}</span>{/if}
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
          {:else if activeTab === "actions"}
            <div>
              {#if filteredActions.length === 0}
                <p class="text-base-content/60 italic">No suggestions.</p>
              {:else}
                <ol class="space-y-2">
                  {#each filteredActions as action, i (actionKey(action))}
                    {@const key = actionKey(action)}
                    {@const active = key === followup.currentlyWorkingOn}
                    <li>
                      <button
                        type="button"
                        class="btn btn-ghost w-full justify-start text-left flex gap-3 items-start h-auto min-h-[2.5rem] py-2 px-3"
                        class:btn-active={active}
                        class:btn-disabled={hasWorkingMatch && !active}
                        data-action-key={key}
                        title={active ? "continue in pi" : undefined}
                        disabled={hasWorkingMatch && !active}
                        aria-disabled={hasWorkingMatch && !active ? "true" : undefined}
                        onclick={() => postAction(action)}
                      >
                        <span class="badge badge-primary badge-sm shrink-0 tabular-nums">{i + 1}</span>
                        {#if active}
                          <span class="spinner loading loading-spinner loading-sm shrink-0" aria-hidden="true"></span>
                          <span class="badge badge-soft badge-primary badge-sm shrink-0">Working…</span>
                        {/if}
                        <span class="label">{action.label}</span>
                      </button>
                    </li>
                  {/each}
                </ol>
              {/if}
            </div>
          {/if}
        </div>
      </section>
    </div>
  </div>
{/if}

<style>
</style>
