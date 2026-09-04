# docs/agents/

Per-repo configuration that the engineering skills read. `setup-workflow`
populates this directory during initial setup; edit the files directly to
reconfigure.

This repo uses `docs/tasks/` files, not an external issue tracker. The
files that live here record that convention and related per-repo knobs:

- `issue-tracker.md`: how skills read/write work items. We use the
  `docs/tasks/` tree (tasks, slices, maps, archive) managed by the
  `task_*` tools, not an external tracker.
- `domain.md`: domain doc layout (single-context vs multi-context) and
  consumer rules for reading `CONTEXT.md` and `docs/adr/`.
- `triage-labels.md`: the label strings mapped to the canonical triage
  roles, when `triage` is configured.

These are created lazily: write them when the matching skill first needs
them, and extend them as the workflow lands.
