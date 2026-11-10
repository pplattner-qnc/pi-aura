# Signals

Signals are inbound planning items that arrive in an inbox for triage. They
are observations or alerts from external sources (customer feedback,
monitoring, automated findings) that someone needs to review and decide
whether they warrant action.

## Listing signals

```
listSignals({ status: "CANDIDATE", limit: 20, page: 1 })
```

**Statuses:** `CANDIDATE` | `ACKNOWLEDGED` | `IN_PLANNING` | `DISMISSED` | `SNOOZED`

## Getting signal detail

```
getSignal({ id: "<signal-uuid>" })
```

Returns the signal with evidence and review history.

## Reviewing a signal

```
reviewSignal({
  id: "<signal-uuid>",
  action: "ACKNOWLEDGE",       // DISMISS | ACKNOWLEDGE | SNOOZE | CREATE_TASK
  reason_text: "Not relevant to our current roadmap"
})
```

`reason_code` (`OPS_NOISE` | `DUPLICATE` | `OUT_OF_SCOPE` |
`ALREADY_TRACKED` | `OTHER`) is required when action is `DISMISS`;
otherwise omit it. `reason_text` is optional free text (max 2000
characters) and can accompany any action.

## Converting a signal to a task

```
createTaskFromSignal({ id: "<signal-uuid>" })
```

Creates an Aura task prefilled from the signal (summary + evidence).
Idempotent when a primary task link already exists.
