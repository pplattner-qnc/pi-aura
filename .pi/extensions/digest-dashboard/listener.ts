// In-process listener for the digest dashboard.
// Subscribes to the in-memory event stream (store.subscribe) and forwards
// page→agent action_click events to the agent via pi.sendMessage.
// No fs.watch, no state.json, no polling.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { subscribe } from "./store.ts";
import type { StateEvent } from "./state.ts";
import type { ActionClickPayload } from "./digest-types.ts";

export interface ListenerOptions {
  pi: ExtensionAPI;
}

export interface ListenerHandle {
  stop(): Promise<void>;
}

function isActionClickPayload(payload: unknown): payload is ActionClickPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "instruction" in payload &&
    typeof (payload as { instruction?: unknown }).instruction === "string"
  );
}

export function startListener({ pi }: ListenerOptions): ListenerHandle {
  const unsubscribe = subscribe((event: StateEvent) => {
    if (event.dir !== "page→agent" || event.type !== "action_click") {
      return;
    }

    if (!isActionClickPayload(event.payload)) {
      console.error("listener: skipping malformed action_click event (missing payload):", event.id);
      return;
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
  });

  return {
    stop: async () => {
      unsubscribe();
    },
  };
}
