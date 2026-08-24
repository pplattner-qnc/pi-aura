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

  // All-clear: every section empty AND no actions.
  let allClear = $derived(
    !!digest &&
    filteredActions.length === 0 &&
    (digest.attention.overdue.length +
      digest.attention.waiting_on_you.length +
      digest.attention.waiting_on_others.length) === 0 &&
    digest.queue.length === 0 &&
    digest.reviews_owed.length === 0 &&
    digest.warnings.length === 0,
  );

  // --- Mount effects ---
  $effect(() => {
    loadDigest();
  });

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
  <p class="loading" role="status" aria-live="polite">Loading digest…</p>
{:else if error}
  <p class="error" role="alert">Error: {error}</p>
{:else if digest}
  <div class="digest">
    <header>
      <h1>Digest — {digest.date}</h1>
      {#if digest.summary}
        <p class="summary">{digest.summary}</p>
      {/if}
    </header>

    {#if allClear}
      <p class="all-clear" role="status">You're all caught up — nothing needs you right now.</p>
    {/if}

    {#if filteredActions.length > 0}
      <section class="actions hero">
        <h2>Today's priorities</h2>
        <ul class="action-list">
          {#each filteredActions as action, i (actionKey(action))}
            {@const key = actionKey(action)}
            {@const active = key === followup.currentlyWorkingOn}
            <li>
              <button
                type="button"
                class="digest-action"
                class:active
                class:primary={i === 0 && !hasWorkingMatch}
                data-action-key={key}
                aria-disabled={hasWorkingMatch && !active ? "true" : undefined}
                title={active ? "continue in pi" : undefined}
                disabled={hasWorkingMatch && !active}
                onclick={() => postAction(action)}
              >
                {#if active}
                  <span class="spinner" aria-hidden="true"></span>
                  <span class="label">{action.label}</span>
                  <span class="active-tag">Working…</span>
                {:else}
                  <span class="label">{action.label}</span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
        {#if hasWorkingMatch}
          <p class="action-caption">Other actions are paused while this one runs in pi.</p>
        {/if}
      </section>
    {/if}

    <section class="attention hero">
      <h2>Attention</h2>
      <div class="attention-grid">
        <div>
          <h3>Overdue</h3>
          {#if digest.attention.overdue.length === 0}
            <p class="empty">Nothing overdue</p>
          {:else}
            <ul>
              {#each digest.attention.overdue as item (item.key)}
                <li><span class="key">{item.key}</span> {item.title}</li>
              {/each}
            </ul>
          {/if}
        </div>
        <div>
          <h3>Waiting on you</h3>
          {#if digest.attention.waiting_on_you.length === 0}
            <p class="empty">Nothing waiting on you</p>
          {:else}
            <ul>
              {#each digest.attention.waiting_on_you as item (item.key)}
                <li><span class="key">{item.key}</span> {item.title}</li>
              {/each}
            </ul>
          {/if}
        </div>
        <div>
          <h3>Waiting on others</h3>
          {#if digest.attention.waiting_on_others.length === 0}
            <p class="empty">Nothing waiting on others</p>
          {:else}
            <ul>
              {#each digest.attention.waiting_on_others as item (item.key)}
                <li><span class="key">{item.key}</span> {item.title}</li>
              {/each}
            </ul>
          {/if}
        </div>
        <div>
          <h3>Notifications</h3>
          {#if digest.attention.notifications.since_last_run.length === 0 && digest.attention.notifications.older_unread.length === 0}
            <p class="empty">No notifications</p>
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
        <p class="empty">No items in queue</p>
      {:else}
        <div class="table-wrap">
          <table>
            <caption class="visually-hidden">Today's committed queue</caption>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Key</th>
                <th scope="col">Title</th>
                <th scope="col">Status</th>
                <th scope="col" class="col-role">Role</th>
                <th scope="col" class="col-cap">Capacity</th>
                <th scope="col" class="col-hours">Hours</th>
              </tr>
            </thead>
            <tbody>
              {#each digest.queue as row (row.key)}
                <tr>
                  <td>{row.rank}</td>
                  <td class="key">{row.key}</td>
                  <td>{row.title}</td>
                  <td>{row.status}</td>
                  <td class="col-role">{row.role}</td>
                  <td class="col-cap">{fmtPct(row.capacity_pct)}</td>
                  <td class="col-hours">{row.hours ?? "—"}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>

    <section class="capacity">
      <h2>Capacity</h2>
      <div class="capacity-row" class:over={digest.capacity.over}>
        <div class="util-bar" aria-hidden="true">
          <div class="util-fill" style="width: {Math.min(100, digest.capacity.utilization_pct)}%"></div>
        </div>
        <dl class="metrics">
          <div><dt>Base</dt><dd>{fmtPct(digest.capacity.base_pct)}</dd></div>
          <div><dt>Committed</dt><dd>{fmtPct(digest.capacity.committed_pct)}</dd></div>
          <div><dt>Free</dt><dd>{fmtPct(digest.capacity.free_pct)}</dd></div>
          <div><dt>Utilization</dt><dd>{fmtPct(digest.capacity.utilization_pct)}</dd></div>
          <div><dt>Hours</dt><dd>{digest.capacity.total_hours}h</dd></div>
        </dl>
        {#if digest.capacity.over}
          <span class="over-badge">Over-committed</span>
        {/if}
      </div>
    </section>

    <section class="reviews">
      <h2>Reviews in flight</h2>
      {#if digest.reviews.length === 0}
        <p class="empty">No reviews in flight</p>
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
        <p class="empty">No reviews pending</p>
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

    <section class="corrections secondary">
      <h2>Corrections</h2>
      {#if digest.corrections.length === 0}
        <p class="empty">No corrections needed</p>
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

    <section class="warnings secondary">
      <h2>Warnings</h2>
      {#if digest.warnings.length === 0}
        <p class="empty">No warnings</p>
      {:else}
        <ul>
          {#each digest.warnings as warning, i (i)}
            <li>{warning}</li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>
{/if}

<style>
  :root {
    --color-text: #1a1a1a;
    --color-text-secondary: #444;
    --color-text-muted: #666;
    --color-text-subtle: #6b7280;
    --color-accent: #2563eb;
    --color-accent-tint: #eff6ff;
    --color-accent-soft: #bfdbfe;
    --color-danger: #b91c1c;
    --color-danger-tint: #fee2e2;
    --color-success: #15803d;
    --color-border: #e5e5e5;
    --color-border-strong: #d1d5db;
    --color-surface: #fff;
    --color-surface-raised: #f9fafb;
    --color-surface-hover: #f3f4f6;
    --color-disabled-bg: #f3f4f6;
    --color-disabled-fg: #9ca3af;
    --color-disabled-border: #e5e7eb;
    --radius: 0.375rem;
    --space-section: 1.5rem;
    --space-gap: 1rem;
    --font-size-h1: 1.5rem;
    --font-size-h2: 1.125rem;
    --font-size-h3: 0.875rem;
  }

  .digest {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    max-width: 64rem;
    margin: 0 auto;
    padding: 1.5rem;
    color: var(--color-text);
    line-height: 1.5;
  }
  .loading, .empty {
    color: var(--color-text-muted);
  }
  .error {
    color: var(--color-danger);
  }
  header {
    margin-bottom: var(--space-section);
  }
  h1 {
    font-size: var(--font-size-h1);
    margin: 0 0 0.5rem;
  }
  .summary {
    color: var(--color-text-secondary);
    margin: 0;
  }
  .all-clear {
    margin: 0 0 var(--space-section);
    padding: 0.75rem 1rem;
    background: #ecfdf5;
    border: 1px solid #a7f3d0;
    border-radius: var(--radius);
    color: var(--color-success);
    font-weight: 500;
  }

  section {
    margin-bottom: var(--space-section);
  }
  /* Hero tiers (priorities + attention) get a raised surface + more separation. */
  section.hero {
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    padding: 1rem 1.25rem;
  }
  section.secondary h2 {
    font-size: 0.9375rem;
    color: var(--color-text-subtle);
  }
  h2 {
    font-size: var(--font-size-h2);
    margin: 0 0 0.75rem;
    border-bottom: 1px solid var(--color-border);
    padding-bottom: 0.25rem;
  }
  h3 {
    font-size: var(--font-size-h3);
    margin: 0 0 0.5rem;
    color: var(--color-text-secondary);
  }
  .attention-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: var(--space-gap);
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
    color: var(--color-text-secondary);
  }
  .subhead {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-subtle);
    margin: 0.5rem 0 0.25rem;
  }

  /* Queue table — scroll wrapper + responsive column hiding. */
  .table-wrap {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }
  th, td {
    text-align: left;
    padding: 0.5rem;
    border-bottom: 1px solid var(--color-border);
  }
  th {
    font-weight: 600;
    color: var(--color-text-secondary);
  }
  .visually-hidden {
    position: absolute;
    width: 1px; height: 1px;
    padding: 0; margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  @media (max-width: 48rem) {
    .col-role, .col-cap { display: none; }
  }
  @media (max-width: 36rem) {
    .col-hours { display: none; }
  }

  /* Capacity — compact metric row + utilization bar. */
  .capacity-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
  }
  .util-bar {
    flex: 1 1 12rem;
    height: 0.5rem;
    background: var(--color-border);
    border-radius: 9999px;
    overflow: hidden;
  }
  .util-fill {
    height: 100%;
    background: var(--color-accent);
    border-radius: 9999px;
    transition: width 0.2s ease;
  }
  .capacity-row.over .util-fill {
    background: var(--color-danger);
  }
  .metrics {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1rem;
    margin: 0;
  }
  .metrics div {
    display: flex;
    flex-direction: column;
  }
  .metrics dt {
    font-size: 0.75rem;
    color: var(--color-text-subtle);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .metrics dd {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 500;
  }
  .over-badge {
    padding: 0.1rem 0.5rem;
    border-radius: 9999px;
    background: var(--color-danger-tint);
    color: var(--color-danger);
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .deadline {
    color: var(--color-text-subtle);
    font-size: 0.875rem;
    margin-left: 0.5rem;
  }
  .stale .note {
    color: var(--color-danger);
  }
  .badge {
    display: inline-block;
    margin-left: 0.5rem;
    padding: 0.05rem 0.4rem;
    border-radius: 9999px;
    background: var(--color-danger-tint);
    color: var(--color-danger);
    font-size: 0.75rem;
    text-transform: uppercase;
  }

  /* Actions — the signature affordance. Primary action is filled; active state is legible. */
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
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius);
    background: var(--color-surface);
    color: var(--color-text);
    font-size: 0.9375rem;
    text-align: left;
    cursor: pointer;
    transition: background 0.1s ease, border-color 0.1s ease;
  }
  .digest-action.primary {
    border-color: var(--color-accent);
    background: var(--color-accent);
    color: #fff;
    font-weight: 500;
  }
  .digest-action.primary:hover:not(:disabled) {
    background: #1d4ed8;
  }
  .digest-action:hover:not(:disabled):not(.primary) {
    background: var(--color-surface-hover);
  }
  .digest-action:disabled {
    background: var(--color-disabled-bg);
    color: var(--color-disabled-fg);
    border-color: var(--color-disabled-border);
    cursor: not-allowed;
  }
  .digest-action.active {
    border-color: var(--color-accent);
    background: var(--color-accent-tint);
    color: var(--color-text);
  }
  .digest-action:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .digest-action .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .active-tag {
    margin-left: auto;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-accent);
    white-space: nowrap;
  }
  .action-caption {
    margin: 0.5rem 0 0;
    font-size: 0.8125rem;
    color: var(--color-text-subtle);
  }
  .spinner {
    display: inline-block;
    width: 1rem;
    height: 1rem;
    border: 2px solid var(--color-accent-soft);
    border-top-color: var(--color-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .spinner { animation: none; }
    .util-fill { transition: none; }
  }
</style>
