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
getSignal({ uuid: "<signal-uuid>" })
```

Returns the signal with evidence and review history.

## Reviewing a signal

```
reviewSignal({
  uuid: "<signal-uuid>",
  action: "ACKNOWLEDGE",       // DISMISS | ACKNOWLEDGE | SNOOZE | CREATE_TASK
  reason_code: "OUT_OF_SCOPE", // OPS_NOISE | DUPLICATE | OUT_OF_SCOPE | ALREADY_TRACKED | OTHER
  reason_text: "Not relevant to our current roadmap"
})
```

## Converting a signal to a task

```
createTaskFromSignal({ uuid: "<signal-uuid>" })
```

Creates an Aura task prefilled from the signal (summary + evidence).
Idempotent when a primary task link already exists.
