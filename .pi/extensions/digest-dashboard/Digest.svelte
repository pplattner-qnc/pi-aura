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
</script>

{#if loading}
  <p class="loading">Loading digest…</p>
{:else if error}
  <p class="error">Error: {error}</p>
{:else if digest}
  <div class="digest">
    <header>
      <h1>Digest — {digest.date}</h1>
      {#if digest.summary}
        <p class="summary">{digest.summary}</p>
      {/if}
    </header>

    <section class="attention">
      <h2>Attention</h2>
      <div class="attention-grid">
        <div>
          <h3>Overdue</h3>
          {#if digest.attention.overdue.length === 0}
            <p class="empty">None</p>
          {:else}
            <ul>
              {#each digest.attention.overdue as item, i (i)}
                <li><span class="key">{item.key}</span> {item.title}</li>
              {/each}
            </ul>
          {/if}
        </div>
        <div>
          <h3>Waiting on you</h3>
          {#if digest.attention.waiting_on_you.length === 0}
            <p class="empty">None</p>
          {:else}
            <ul>
              {#each digest.attention.waiting_on_you as item, i (i)}
                <li><span class="key">{item.key}</span> {item.title}</li>
              {/each}
            </ul>
          {/if}
        </div>
        <div>
          <h3>Waiting on others</h3>
          {#if digest.attention.waiting_on_others.length === 0}
            <p class="empty">None</p>
          {:else}
            <ul>
              {#each digest.attention.waiting_on_others as item, i (i)}
                <li><span class="key">{item.key}</span> {item.title}</li>
              {/each}
            </ul>
          {/if}
        </div>
        <div>
          <h3>Notifications</h3>
          {#if digest.attention.notifications.since_last_run.length === 0 && digest.attention.notifications.older_unread.length === 0}
            <p class="empty">None</p>
          {:else}
            {#if digest.attention.notifications.since_last_run.length > 0}
              <p class="subhead">Since last run</p>
              <ul>
                {#each digest.attention.notifications.since_last_run as note, i (i)}
                  <li>{note}</li>
                {/each}
              </ul>
            {/if}
            {#if digest.attention.notifications.older_unread.length > 0}
              <p class="subhead">Older unread</p>
              <ul>
                {#each digest.attention.notifications.older_unread as note, i (i)}
                  <li>{note}</li>
                {/each}
              </ul>
            {/if}
          {/if}
        </div>
      </div>
    </section>

    <section class="queue">
      <h2>Queue</h2>
      {#if digest.queue.length === 0}
        <p class="empty">No queued items.</p>
      {:else}
        <table>
          <thead>
            <tr><th>Rank</th><th>Key</th><th>Title</th><th>Status</th><th>Role</th><th>Capacity</th><th>Hours</th></tr>
          </thead>
          <tbody>
            {#each digest.queue as row (row.key)}
              <tr>
                <td>{row.rank}</td>
                <td class="key">{row.key}</td>
                <td>{row.title}</td>
                <td>{row.status}</td>
                <td>{row.role}</td>
                <td>{fmtPct(row.capacity_pct)}</td>
                <td>{row.hours ?? "—"}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>

    <section class="capacity">
      <h2>Capacity</h2>
      <p>
        Base {fmtPct(digest.capacity.base_pct)} · Committed {fmtPct(digest.capacity.committed_pct)}
        · Free {fmtPct(digest.capacity.free_pct)} · Utilization {fmtPct(digest.capacity.utilization_pct)}
        · {digest.capacity.total_hours}h
        {#if digest.capacity.over}<span class="over">(over-committed)</span>{/if}
      </p>
    </section>

    <section class="reviews">
      <h2>Reviews in flight</h2>
      {#if digest.reviews.length === 0}
        <p class="empty">None.</p>
      {:else}
        <ul>
          {#each digest.reviews as review (review.artifact_id)}
            <li>
              <span class="key">{review.artifact_id}</span> {review.title} (v{review.version})
              — {review.decided_count}/{review.total_required} decided
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="reviews-owed">
      <h2>Reviews owed</h2>
      {#if digest.reviews_owed.length === 0}
        <p class="empty">None.</p>
      {:else}
        <ul>
          {#each digest.reviews_owed as review (review.artifact_id)}
            <li>
              <span class="key">{review.artifact_id}</span> {review.title}
              {#if review.deadline}<span class="deadline">due {review.deadline}</span>{/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="corrections">
      <h2>Corrections</h2>
      {#if digest.corrections.length === 0}
        <p class="empty">None.</p>
      {:else}
        <ul>
          {#each digest.corrections as correction (correction.artifact_id)}
            <li class={correction.stale ? "stale" : ""}>
              <span class="key">{correction.artifact_id}</span> {correction.title}
              {#if correction.stale}<span class="badge">stale</span>{/if}
              <span class="note">{correction.note}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="warnings">
      <h2>Warnings</h2>
      {#if digest.warnings.length === 0}
        <p class="empty">None.</p>
      {:else}
        <ul>
          {#each digest.warnings as warning, i (i)}
            <li>{warning}</li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="actions">
      <h2>Actions</h2>
      {#if filteredActions.length === 0}
        <p class="empty">No actions</p>
      {:else}
        <ul class="action-list">
          {#each filteredActions as action (actionKey(action))}
            {@const key = actionKey(action)}
            {@const active = key === followup.currentlyWorkingOn}
            <li>
              <button
                type="button"
                class="digest-action"
                class:active
                data-action-key={key}
                title={active ? "continue in pi" : undefined}
                disabled={hasWorkingMatch && !active}
                onclick={() => postAction(action)}
              >
                {#if active}
                  <span class="spinner" aria-hidden="true"></span>
                {/if}
                <span class="label">{action.label}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>
{/if}

<style>
  .digest {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    max-width: 64rem;
    margin: 0 auto;
    padding: 1.5rem;
    color: #1a1a1a;
  }
  .loading, .error, .empty {
    color: #666;
  }
  .error {
    color: #b91c1c;
  }
  header {
    margin-bottom: 1.5rem;
  }
  h1 {
    font-size: 1.5rem;
    margin: 0 0 0.5rem;
  }
  .summary {
    color: #444;
    margin: 0;
  }
  section {
    margin-bottom: 1.5rem;
  }
  h2 {
    font-size: 1.125rem;
    margin: 0 0 0.75rem;
    border-bottom: 1px solid #e5e5e5;
    padding-bottom: 0.25rem;
  }
  h3 {
    font-size: 0.875rem;
    margin: 0 0 0.5rem;
    color: #555;
  }
  .attention-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: 1rem;
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  li {
    padding: 0.25rem 0;
  }
  .key {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.875rem;
    color: #2563eb;
  }
  .subhead {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #777;
    margin: 0.5rem 0 0.25rem;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }
  th, td {
    text-align: left;
    padding: 0.5rem;
    border-bottom: 1px solid #e5e5e5;
  }
  th {
    font-weight: 600;
    color: #555;
  }
  .over {
    color: #b91c1c;
    font-weight: 600;
    margin-left: 0.5rem;
  }
  .deadline {
    color: #777;
    font-size: 0.875rem;
    margin-left: 0.5rem;
  }
  .stale .note {
    color: #b91c1c;
  }
  .badge {
    display: inline-block;
    margin-left: 0.5rem;
    padding: 0.05rem 0.4rem;
    border-radius: 9999px;
    background: #fee2e2;
    color: #b91c1c;
    font-size: 0.75rem;
    text-transform: uppercase;
  }

  .action-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .digest-action {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    max-width: 32rem;
    padding: 0.625rem 0.875rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    background: #fff;
    color: #111;
    font-size: 0.9375rem;
    text-align: left;
    cursor: pointer;
    transition: background 0.1s ease;
  }
  .digest-action:hover:not(:disabled) {
    background: #f3f4f6;
  }
  .digest-action:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .digest-action.active {
    border-color: #2563eb;
    background: #eff6ff;
  }
  .digest-action .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .spinner {
    display: inline-block;
    width: 1rem;
    height: 1rem;
    border: 2px solid #bfdbfe;
    border-top-color: #2563eb;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
