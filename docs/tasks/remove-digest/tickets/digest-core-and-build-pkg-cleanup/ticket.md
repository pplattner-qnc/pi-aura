---
type: ticket
subtype: feature
title: Remove the shared digest core and the scripts-side digest leftovers
status: stable
workflow_state: ready
blocked_by: [dashboard-extension-removal]
size: m
---

## What to build

With the dashboard gone, the digest data core becomes unconsumed: delete the
shared digest module family (fetch core, action builder, dev-links with its
Bitbucket client and Atlassian clients, the in-process MCP client, the
scheduler, the types, the digest settings loader), its unit tests, and the
seven digest subpath exports from the shared package manifest. Delete the
legacy morning-fetch script and the followup unit test in the scripts
workspace. Delete the three dev-links e2e trees under the root test tree
(the Bitbucket reader and Atlassian client suites; all of them import the
digest clients). Drop the MCP SDK dependency from the scripts workspace
manifest (its only consumer was the deleted in-process client) and rename
that manifest away from its digest-era name, fixing its description.

## Acceptance criteria

- [ ] The shared package exports no digest subpaths and contains no digest
      source or test modules.
- [ ] The shared unit suite runs green without the digest suites.
- [ ] The scripts workspace carries no morning-fetch script, no followup
      test, no MCP SDK dependency, and no digest-era package name or
      description.
- [ ] The root test tree no longer contains the three dev-links e2e
      families; the remaining tree still runs green.
- [ ] Typecheck and the bundle build stay green.

## Blocked by

- dashboard-extension-removal (the dashboard was the digest core's last
  non-test consumer).
