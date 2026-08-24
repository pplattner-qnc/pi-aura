import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI): void {
  pi.registerCommand("digest-dashboard", {
    description: "Aura digest interactive dashboard",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      ctx.ui.notify("stub", "info");
    },
  });
}
