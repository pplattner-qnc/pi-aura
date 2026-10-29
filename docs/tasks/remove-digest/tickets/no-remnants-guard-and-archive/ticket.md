---
type: ticket
subtype: feature
title: Add the no-remnants guard and archive the dead digest effort
status: stable
workflow_state: ready
blocked_by: [digest-skill-and-agents-removal, manifest-and-infra-cleanup]
size: m
---

## What to build

A structural guard suite in the shared package's test tree asserts the
removal is total: no digest subpath exports, no digest source or test
directories, no dashboard extension directory, no subagents registration or
agents directory, and a root devDependency list free of the dashboard
stack. The dead digest effort (the phase-transition ticket) is archived in
the task tree and the root index drops it from the live list. A
registration smoke proves the end state: a fresh pi session loads the
package with no errors, the secrets command registers, and no digest command
or tools appear.

## Acceptance criteria

- [ ] The structural guard suite runs green in the shared package's runner.
- [ ] The guard fails if any digest remnant (export, directory,
      registration, or dashboard-stack dependency) reappears.
- [ ] The dead digest effort is archived and the task index no longer lists
      it as live.
- [ ] The registration smoke passes: clean load, secrets command present,
      digest command and tools absent.

## Blocked by

- digest-skill-and-agents-removal (the guard asserts the skill and agent
  directories are gone).
- manifest-and-infra-cleanup (the guard asserts the final manifest and
  dependency shape; transitively gated by the three removal tickets).
