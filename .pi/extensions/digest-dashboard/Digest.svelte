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
  <div class="digest min-h-screen bg-base-100 text-base-content p-4 sm:p-6">
    <div class="max-w-5xl mx-auto space-y-6">
      <header class="space-y-3">
        <p class="text-sm font-medium uppercase tracking-widest text-base-content/50">Morning briefing</p>
        <h1 class="text-3xl sm:text-4xl font-bold tracking-tight">{day}</h1>
        {#if digest.summary}
          <blockquote class="bg-base-200/60 rounded-lg px-4 py-3 text-base text-base-content/80 italic leading-relaxed">
            {digest.summary}
          </blockquote>
        {/if}
      </header>

      <main class="space-y-6">
        <!-- Today's priorities (interactive actions) -->
        <section class="bg-base-100 shadow-sm ring-1 ring-base-200 rounded-2xl p-5 sm:p-6">
          <h2 class="text-lg font-semibold tracking-tight mb-4">Today's priorities</h2>
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
        </section>

        <!-- Attention -->
        <section class="bg-base-100 shadow-sm ring-1 ring-base-200 rounded-2xl p-5 sm:p-6">
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

        <!-- Queue -->
        <section class="bg-base-100 shadow-sm ring-1 ring-base-200 rounded-2xl p-5 sm:p-6">
          <h2 class="text-lg font-semibold tracking-tight mb-4">Today's queue</h2>
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
        </section>

        <!-- Capacity -->
        <section class="bg-base-100 shadow-sm rounded-2xl p-5 sm:p-6">
          <h2 class="text-lg font-semibold tracking-tight mb-4">Capacity</h2>
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
        </section>

        <!-- Reviews due -->
        <section class="bg-base-100 shadow-sm rounded-2xl p-5 sm:p-6">
          <h2 class="text-lg font-semibold tracking-tight mb-4">Reviews due</h2>
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
        </section>

        <!-- Reviews owed -->
        <section class="bg-base-100 shadow-sm rounded-2xl p-5 sm:p-6">
          <h2 class="text-lg font-semibold tracking-tight mb-4">Reviews I owe</h2>
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
        </section>

        <!-- Corrections -->
        <section class="bg-base-100 shadow-sm rounded-2xl p-5 sm:p-6">
          <h2 class="text-lg font-semibold tracking-tight mb-4">Corrections</h2>
          <div>
            {#if true}
            {@const stale = digest.corrections.filter((c) => c.stale)}
            {#if stale.length === 0}
              <p class="text-base-content/60 italic">All reported review states match current versions.</p>
            {:else}
              <ul class="space-y-1">
                {#each stale as correction (correction.artifact_id)}
                  <li>
                    <span class="text-base-content/50">↳</span>
                    {correction.title} — <span class="text-base-content/70">{correction.note}</span>
                  </li>
                {/each}
              </ul>
            {/if}
            {/if}
          </div>
        </section>

        <!-- Dev links -->
        <section class="bg-base-100 shadow-sm rounded-2xl p-5 sm:p-6">
          <h2 class="text-lg font-semibold tracking-tight mb-4">Dev links</h2>
          <div>
            {#if true}
            {@const links = digest.dev_links ?? []}
            {@const withPrs = links.filter((l) => l.pull_requests.length > 0 || l.branches.length > 0)}
            {#if links.length === 0}
              <p class="text-base-content/60 italic">No dev-links configured (set auraDigest in settings to enable).</p>
            {:else if withPrs.length === 0}
              <p class="text-base-content/60 italic">No related PRs or branches found for queue tasks.</p>
            {:else}
              {@const errs = links.flatMap((l) => l.errors.map((e) => `${l.task_key}: ${e}`))}
              <ul class="space-y-1">
                {#each withPrs as link (link.task_key)}
                  {#each link.pull_requests as pr (pr.url)}
                    <li>
                      {link.task_key}: {stateEmoji(pr.state)} {pr.provider} #{pr.id} — {pr.title} ({pr.state.toLowerCase()})
                    </li>
                  {/each}
                  {#each link.branches as branch (branch.name)}
                    <li>
                      {link.task_key}: 🌿 {branch.provider} {branch.repo} <strong>{branch.name}</strong>
                    </li>
                  {/each}
                {/each}
              </ul>
              {#if errs.length > 0}
                <p class="text-xs text-base-content/50 mt-3"><em>errors:</em></p>
                <ul class="text-xs text-base-content/50 mt-1 space-y-0.5">
                  {#each errs.slice(0, 3) as e, i (i)}
                    <li>{e}</li>
                  {/each}
                </ul>
              {/if}
            {/if}
            {/if}
          </div>
        </section>

        <!-- Warnings -->
        {#if digest.warnings.length > 0}
          <section class="alert alert-warning">
            <h2 class="font-semibold">⚠️ Warnings</h2>
            <ul class="list-disc list-inside mt-1">
              {#each digest.warnings as warning, i (i)}
                <li>{warning}</li>
              {/each}
            </ul>
          </section>
        {/if}
      </main>
    </div>
  </div>
{/if}

<style>
</style>
