/**
 * Aura Secrets Extension
 *
 * Registers the `/aura` slash-command with `secrets` subcommands for managing
 * the Aura PAT in the OS keyring.
 *
 * Slice 1 (aura-command-skeleton) implements the command skeleton, subcommand
 * dispatch, and completions. The `secrets discover` and `secrets edit`
 * subcommands are stubs here; slices 2 and 3 will replace them.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export type AuraSubcommand = "secrets-discover" | "secrets-edit" | "usage";

export interface ParsedAuraArgs {
  command: AuraSubcommand;
  rest: string;
}

export function parseAuraArgs(args: string): ParsedAuraArgs {
  const tokens = args.trim().split(/\s+/).filter(Boolean);

  if (tokens.length === 0) {
    return { command: "usage", rest: "" };
  }

  if (tokens[0] !== "secrets") {
    return { command: "usage", rest: tokens.join(" ") };
  }

  if (tokens.length === 1) {
    return { command: "usage", rest: "secrets" };
  }

  const sub = tokens[1];
  const rest = tokens.slice(2).join(" ");

  if (sub === "discover") {
    return { command: "secrets-discover", rest };
  }

  if (sub === "edit") {
    return { command: "secrets-edit", rest };
  }

  return { command: "usage", rest: `${tokens[0]} ${sub}` };
}

type AutocompleteItem = { value: string; label: string };

function getArgumentCompletions(prefix: string): AutocompleteItem[] | null {
  // TODO: implement completions
  return null;
}

const USAGE = "Usage: /aura secrets {discover|edit}";

export default function auraSecretsExtension(pi: ExtensionAPI) {
  pi.registerCommand("aura", {
    description: "Manage Aura secrets in the system keyring",
    getArgumentCompletions,
    handler: async (args, ctx) => {
      const parsed = parseAuraArgs(args);
      switch (parsed.command) {
        case "secrets-discover":
          ctx.ui.notify("not implemented", "info");
          return;
        case "secrets-edit":
          ctx.ui.notify("not implemented", "info");
          return;
        default:
          ctx.ui.notify(USAGE, "warning");
          return;
      }
    },
  });
}
