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
    StateEvent,
  } from "./digest-types.ts";

  // --- State ---
  let digest = $state<Digest | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

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

  // Hot-reload via SSE. Kept separate from the initial load so a slow initial
  // fetch isn't raced by an onmessage re-fetch.
  $effect(() => {
    const source = new EventSource("/events");
    source.onmessage = () => loadDigest();
    source.onerror = (err) => console.error("EventSource error:", err);
    return () => source.close();
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

  function reviewerNames(reviews: DigestReview[]): string[] {
    const names: string[] = [];
    const seen = new Set<string>();
    for (const r of reviews) {
      for (const d of r.decisions) {
        const first = d.user_name.split(",")[0].trim();
        if (!seen.has(first)) {
          seen.add(first);
          names.push(first);
        }
      }
    }
    return names;
  }

  function pctToHours(pct: number | null): number | null {
    if (pct === null) return null;
    return (pct * WORKDAY_HOURS) / 100;
  }
</script>

{#if loading}
  <p class="text-base-content/60 italic">Loading digest…</p>
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
                        <li class="text-sm">{note}</li>
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
                        <li class="text-sm">{note}</li>
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
              <div class="overflow-x-auto">
                <table class="table table-sm w-full">
                  <thead>
                    <tr class="text-base-content/60 text-xs uppercase tracking-wide">
                      <th>#</th>
                      <th>Task</th>
                      <th>Status</th>
                      <th>Role</th>
                      <th>Cap</th>
                      <th>Hours</th>
                      <th>Git</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each digest.queue as row (row.key)}
                      <tr>
                        <td class="tabular-nums text-base-content/50">{row.rank}</td>
                        <td>
                          {#if row.key}{row.key} — {/if}{row.title}
                        </td>
                        <td><span class="badge badge-ghost badge-sm">{row.status}</span></td>
                        <td><span class="badge badge-outline badge-sm">{row.role}</span></td>
                        <td class="tabular-nums">{fmtPct(row.capacity_pct)}</td>
                        <td class="tabular-nums">{fmtHours(row.hours ?? pctToHours(row.capacity_pct))}</td>
                        <td class="text-base-content/70">{row.git_summary ?? ""}</td>
                      </tr>
                    {/each}
                    <tr class="font-semibold border-t-2 border-base-300">
                      <td></td>
                      <td>Committed</td>
                      <td></td>
                      <td></td>
                      <td class="tabular-nums">{totalPct}%</td>
                      <td class="tabular-nums">{fmtHours(totalHours)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p class="text-xs text-base-content/50 mt-2">8hr workday → hours = capacity% × {WORKDAY_HOURS}, rounded to ¼h</p>
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
                          <tr>
                            <td>{review.title}</td>
                            <td class="tabular-nums text-base-content/50">{review.version}</td>
                            {#each names as name (name)}
                              <td class="text-center">{byName.get(name) ?? ""}</td>
                            {/each}
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  </div>
                  {/if}
                  <p class="text-xs text-base-content/50 mt-2">
                    <span aria-hidden="true">⏳</span> pending · <span aria-hidden="true">✅</span> approved · <span aria-hidden="true">❌</span> rejected/needs revision
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
