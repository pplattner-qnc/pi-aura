---
type: ticket
subtype: feature
title: Refresh the root docs to the post-removal package
status: stable
workflow_state: ready
blocked_by: [digest-skill-and-agents-removal, manifest-and-infra-cleanup]
size: m
---

## What to build

The five root docs describe the package as it now is: the README loses the
digest skill row, the agents table, the morning-routine usage section, and
the digest design-principle lines; the glossary loses the digest terms and
rewords the client-consumer relationships; the agent conventions doc loses
the digest skill line; the testing doc loses its digest and Atlassian
sections and re-points its keyring example to a remaining test; the dev-env
doc drops its digest reproduction mention. No doc mentions the digest
anywhere outside the task tree's history.

## Acceptance criteria

- [ ] The five root docs (README, glossary, agent conventions, testing,
      dev-env) contain no digest or Atlassian-provisioning mentions.
- [ ] The testing doc's runner and mock-convention descriptions match the
      post-removal reality (no root vitest, remaining suites only).
- [ ] The README's skill and agent tables match what the package actually
      ships.
- [ ] No em-dashes appear in any touched prose.

## Blocked by

- digest-skill-and-agents-removal (the docs describe the final skill and
  agent surface).
- manifest-and-infra-cleanup (the docs describe the final runner and
  dependency reality).
