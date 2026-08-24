// In-process fs.watch listener for ~/.pi/aura/state.json.
// Forwards page→agent action_click events to the agent via pi.sendMessage.
// Exits cleanly when state.json is deleted (teardown signal from slice 5).

import { watch, type FSWatcher, existsSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readState } from "./state.ts";
import type { StateEvent, StateFile } from "./state.ts";
import type { ActionClickPayload } from "./digest-types.ts";

export interface ListenerOptions {
  pi: ExtensionAPI;
  statePath: string;
  /** Polling fallback interval in ms (fs.watch reliability safety net). */
  pollIntervalMs?: number;
}

export interface ListenerHandle {
  stop(): Promise<void>;
}

const DEFAULT_POLL_INTERVAL_MS = 100;

function isActionClickPayload(payload: unknown): payload is ActionClickPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "instruction" in payload &&
    typeof (payload as { instruction?: unknown }).instruction === "string"
  );
}

export function startListener({
  pi,
  statePath,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: ListenerOptions): ListenerHandle {
  let cursor = 0;
  let watcher: FSWatcher | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let deleteTimer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let stopResolve: (() => void) | undefined;
  const stopPromise = new Promise<void>((resolve) => {
    stopResolve = resolve;
  });

  function cleanup(): void {
    if (stopped) return;
    stopped = true;
    if (watcher) {
      watcher.close();
      watcher = undefined;
    }
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }
    if (deleteTimer) {
      clearTimeout(deleteTimer);
      deleteTimer = undefined;
    }
    stopResolve?.();
  }

  function scheduleDeletionCleanup(): void {
    if (deleteTimer || stopped) return;
    deleteTimer = setTimeout(() => {
      deleteTimer = undefined;
      cleanup();
    }, 500);
  }

  function cancelDeletionCleanup(): void {
    if (deleteTimer) {
      clearTimeout(deleteTimer);
      deleteTimer = undefined;
    }
  }

  function processEvents(state: StateFile): void {
    for (const event of state.events) {
      if (event.id <= cursor) continue;
      cursor = event.id;

      if (event.dir === "page→agent" && event.type === "action_click") {
        if (!isActionClickPayload(event.payload)) {
          console.error("listener: skipping malformed action_click event (missing payload):", event.id);
          continue;
        }
        const payload = event.payload;
        try {
          pi.sendMessage(
            {
              customType: "aura-digest-event",
              content: payload.instruction,
              details: payload,
              display: true,
            },
            { triggerTurn: true, deliverAs: "steer" },
          );
        } catch (err) {
          console.error("listener: sendMessage failed for event", event.id, err);
        }
      }
    }
  }

  function scan(): void {
    if (stopped) return;

    if (!existsSync(statePath)) {
      // Deletion is handled by the watcher-driven deletion timer. Relying on
      // the timer avoids mistaking a rapid atomic replace for teardown.
      return;
    }

    // File has reappeared after a potential atomic replace.
    cancelDeletionCleanup();
    if (!watcher) {
      openWatcher();
    }

    let state: StateFile;
    try {
      state = readState(statePath);
    } catch (err) {
      console.error("listener: failed to read state.json:", err);
      return;
    }

    processEvents(state);
  }

  function openWatcher(): void {
    if (stopped || watcher) return;
    try {
      watcher = watch(statePath, (eventType) => {
        if (stopped) return;

        if (eventType === "rename") {
          if (!existsSync(statePath)) {
            // The path may be gone for good (teardown) or briefly during an
            // atomic replace. Close the (now stale) watcher and start a grace
            // period; if the file reappears the polling fallback reopens it.
            if (watcher) {
              watcher.close();
              watcher = undefined;
            }
            scheduleDeletionCleanup();
            return;
          }
          // Atomic replace: the old inode is gone; re-attach to the new one.
          if (watcher) {
            watcher.close();
            watcher = undefined;
          }
          openWatcher();
        }

        scan();
      });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "ENOENT") {
        // State file does not exist yet (normal before index.ts writes the
        // PID, or in tests). The polling fallback will retry once it appears.
        return;
      }
      console.error("listener: failed to watch state.json:", err);
      cleanup();
    }
  }

  // Initialize cursor from any pre-existing events so mid-session starts don't replay history.
  try {
    const initial = readState(statePath);
    cursor = initial.events.reduce((max, e) => Math.max(max, e.id ?? 0), 0);
  } catch {
    cursor = 0;
  }

  openWatcher();

  pollTimer = setInterval(() => {
    scan();
  }, pollIntervalMs);

  return {
    stop: () => {
      cleanup();
      return stopPromise;
    },
  };
}
