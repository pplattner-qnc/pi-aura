// Unit tests for the /digest slash command (slice 1):
// - activates digest tools
// - injects the aura-digest SKILL.md with triggerTurn
// - idempotent activation
// - clear error when SKILL.md cannot be read

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { default as installExtension } from "../../.pi/extensions/digest-dashboard/index.ts";

interface RegisterCommandCall {
  name: string;
  def: {
    description: string;
    handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> | void;
  };
}

interface SentMessage {
  message: {
    customType: string;
    content: string;
    display?: boolean;
    details?: unknown;
  };
  options: {
    triggerTurn?: boolean;
    deliverAs?: string;
  };
}

interface NotifyCall {
  message: string;
  severity: string;
}

function createFakePi(initialActiveTools: string[] = []): {
  pi: ExtensionAPI;
  activeTools: string[];
  sent: SentMessage[];
  registerCommandCalls: RegisterCommandCall[];
  notifyCalls: NotifyCall[];
} {
  const activeTools: string[] = [...initialActiveTools];
  const sent: SentMessage[] = [];
  const registerCommandCalls: RegisterCommandCall[] = [];
  const notifyCalls: NotifyCall[] = [];

  const pi = {
    getActiveTools: vi.fn(() => [...activeTools]),
    setActiveTools: vi.fn((tools: string[]) => {
      activeTools.length = 0;
      activeTools.push(...tools);
    }),
    sendMessage: vi.fn((message, options) => {
      sent.push({ message, options });
    }),
    registerTool: vi.fn(),
    registerCommand: vi.fn((name: string, def: RegisterCommandCall["def"]) => {
      registerCommandCalls.push({ name, def });
    }),
    on: vi.fn(),
  } as unknown as ExtensionAPI;

  return { pi, activeTools, sent, registerCommandCalls, notifyCalls };
}

function createCtx(notifyCalls?: NotifyCall[]): ExtensionCommandContext {
  return {
    ui: {
      notify: (message: string, severity: string) => {
        notifyCalls?.push({ message, severity });
      },
    },
  } as ExtensionCommandContext;
}

describe("/digest command", () => {
  it("registers a digest command", () => {
    const { pi, registerCommandCalls } = createFakePi();
    installExtension(pi);

    const digestCommand = registerCommandCalls.find((c) => c.name === "digest");
    expect(digestCommand).toBeDefined();
    expect(digestCommand!.def.description).toBeTruthy();
  });
});
