// Unit tests for the /aura-digest slash command (slice 1):
// - activates digest tools
// - injects the aura-digest SKILL.md with triggerTurn
// - idempotent activation
// - clear error when SKILL.md cannot be read

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { default as installExtension } from "../../.pi/extensions/digest-dashboard/index.ts";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readFileSync: vi.fn(actual.readFileSync),
  };
});

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

describe("session_start filter", () => {
  it("removes digest tools from the active set", () => {
    const { pi, activeTools } = createFakePi([
      "digest-dashboard-start",
      "digest-dashboard-stop",
      "digest-fetch",
      "digest-save",
      "some-other-tool",
    ]);
    installExtension(pi);

    const sessionStartHandler = pi.on.mock.calls.find((call) => call[0] === "session_start")?.[1];
    expect(sessionStartHandler).toBeDefined();
    sessionStartHandler({}, { cwd: "/tmp" });

    expect(activeTools).not.toContain("digest-dashboard-start");
    expect(activeTools).not.toContain("digest-dashboard-stop");
    expect(activeTools).not.toContain("digest-fetch");
    expect(activeTools).not.toContain("digest-save");
    expect(activeTools).toContain("some-other-tool");
  });
});

describe("/aura-digest command", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers an aura-digest command", () => {
    const { pi, registerCommandCalls } = createFakePi();
    installExtension(pi);

    const digestCommand = registerCommandCalls.find((c) => c.name === "aura-digest");
    expect(digestCommand).toBeDefined();
    expect(digestCommand!.def.description).toBeTruthy();
  });

  it("does not register the old digest-dashboard command", () => {
    const { pi, registerCommandCalls } = createFakePi();
    installExtension(pi);

    const oldCommand = registerCommandCalls.find((c) => c.name === "digest-dashboard");
    expect(oldCommand).toBeUndefined();
  });

  it("activates all digest tools", async () => {
    const { pi, activeTools, registerCommandCalls } = createFakePi(["some-other-tool"]);
    installExtension(pi);

    const digestCommand = registerCommandCalls.find((c) => c.name === "aura-digest")!;
    await digestCommand.def.handler("", createCtx());

    expect(activeTools).toContain("digest-dashboard-start");
    expect(activeTools).toContain("digest-dashboard-stop");
    expect(activeTools).toContain("digest-fetch");
    expect(activeTools).toContain("digest-save");
    expect(activeTools).toContain("digest-log");
    expect(activeTools).toContain("digest-update");
    expect(activeTools).toContain("digest-ack");
    expect(activeTools).toContain("some-other-tool");
    expect(activeTools.filter((t) => t.startsWith("digest-"))).toHaveLength(7);
  });

  it("injects the aura-digest SKILL.md with triggerTurn", async () => {
    const { pi, sent, registerCommandCalls } = createFakePi();
    installExtension(pi);

    const digestCommand = registerCommandCalls.find((c) => c.name === "aura-digest")!;
    await digestCommand.def.handler("", createCtx());

    expect(sent).toHaveLength(1);
    expect(sent[0].message.customType).toBe("aura-digest-skill");
    expect(sent[0].message.content).toContain("Aura — Digest");
    expect(sent[0].message.display).toBe(false);
    expect(sent[0].options.triggerTurn).toBe(true);
  });

  it("is idempotent when run twice", async () => {
    const { pi, activeTools, registerCommandCalls } = createFakePi();
    installExtension(pi);

    const digestCommand = registerCommandCalls.find((c) => c.name === "aura-digest")!;
    const ctx = createCtx();
    await digestCommand.def.handler("", ctx);
    await digestCommand.def.handler("", ctx);

    expect(activeTools).toHaveLength(7);
    expect([...new Set(activeTools)]).toHaveLength(7);
  });

  it("reports a clear error when SKILL.md cannot be read", async () => {
    const { readFileSync: mockedReadFileSync } = await import("node:fs");
    vi.mocked(mockedReadFileSync).mockImplementation(() => {
      throw new Error("ENOENT: no such file");
    });

    const { pi, sent, registerCommandCalls, notifyCalls } = createFakePi();
    installExtension(pi);

    const digestCommand = registerCommandCalls.find((c) => c.name === "aura-digest")!;
    await digestCommand.def.handler("", createCtx(notifyCalls));

    expect(sent).toHaveLength(0);
    expect(notifyCalls).toHaveLength(1);
    expect(notifyCalls[0].message).toContain("Failed to inject aura-digest skill");
    expect(notifyCalls[0].severity).toBe("error");
  });
});
