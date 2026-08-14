# Signals

> **⚠️ Not yet fully understood — use with caution.**
> The signals system has not been explored with real data yet. The
> information below is inferred from tool descriptions only and may be
> incomplete or inaccurate. Update this file once we have hands-on
> experience with actual signals.

Signals are inbound planning items that arrive in an inbox for triage. They
appear to be observations or alerts from external sources (customer feedback,
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
