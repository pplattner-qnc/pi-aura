/**
 * Aura Health Check Extension
 *
 * Registers /aura-skills-health — a diagnostic command that checks whether the
 * Aura MCP is configured in the pi-mcp-adapter and reachable.
 *
 * (The mcpx CLI checks were removed when the file-based artifact/wiki workflows
 * moved to the `aura` skill's own `aura.mjs` script — mcpx is no longer used.)
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

interface CheckResult {
  label: string;
  ok: boolean;
  detail: string;
  fix?: string;
}

function check(label: string, fix: string, fn: () => string): CheckResult {
  try {
    const detail = fn();
    return { label, ok: true, detail };
  } catch (e) {
    return { label, ok: false, detail: e instanceof Error ? e.message : String(e), fix };
  }
}

const MCP_CONFIG_PATH = join(homedir(), ".config", "mcp", "mcp.json");

export default function (pi: ExtensionAPI) {
  pi.registerCommand("aura-skills-health", {
    description: "Check Aura integration health — MCP adapter config and Aura connectivity",
    handler: async (_args, ctx) => {
      const results: CheckResult[] = [];

      // 1. Pi MCP adapter — aura server present
      results.push(
        check(
          "Pi MCP adapter configured",
          `Add the Aura server to ${MCP_CONFIG_PATH}:\n` +
            `  {\n` +
            `    "mcpServers": {\n` +
            `      "aura-mcp-dev": {\n` +
            `        "type": "http",\n` +
            `        "url": "https://aura.dev-anwalt.de/mcp",\n` +
            `        "auth": "bearer",\n` +
            `        "bearerToken": "<your-aura-pat>"\n` +
            `      }\n` +
            `    }\n` +
            `  }`,
          () => {
            const raw = JSON.parse(readFileSync(MCP_CONFIG_PATH, "utf-8"));
            const server = raw?.mcpServers?.["aura-mcp-dev"];
            if (!server) throw new Error("aura-mcp-dev not found in ~/.config/mcp/mcp.json");
            if (!server.url) throw new Error("aura-mcp-dev missing url");
            return `url: ${server.url}`;
          },
        ),
      );

      // 2. Pi MCP adapter — has bearer token
      results.push(
        check(
          "Pi MCP adapter has credentials",
          `Add a bearerToken to the aura-mcp-dev entry in ${MCP_CONFIG_PATH}.\n` +
            `  Generate a PAT in Aura: Settings → Personal Access Tokens.`,
          () => {
            const raw = JSON.parse(readFileSync(MCP_CONFIG_PATH, "utf-8"));
            const server = raw?.mcpServers?.["aura-mcp-dev"];
            if (!server?.bearerToken) throw new Error("No bearerToken configured");
            return `token: ${server.bearerToken.slice(0, 12)}…`;
          },
        ),
      );

      // 3. Aura reachable — a direct MCP ping via the pi-mcp-adapter tool
      results.push(
        check(
          "Aura reachable via MCP",
          "Check that the Aura server is up and the URL is correct.\n" +
            "  Verify with: pi aura-skills-health (re-run) or call aura-mcp-dev getBoardSummary.",
          () => {
            // We can't easily drive the MCP adapter from here without the
            // extension API exposing it, so we do a lightweight HTTP reachability
            // check on the configured URL.
            const raw = JSON.parse(readFileSync(MCP_CONFIG_PATH, "utf-8"));
            const server = raw?.mcpServers?.["aura-mcp-dev"];
            if (!server?.url) throw new Error("No URL to check");
            // A bare fetch isn't available in all extension runtimes; use curl.
            const out = execSync(
              `curl -s -o /dev/null -w "%{http_code}" --max-time 10 -X POST "${server.url}" ` +
              `-H "Authorization: Bearer ${server.bearerToken}" ` +
              `-H "Content-Type: application/json" ` +
              `-d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"health","version":"1"}}}'`,
              { encoding: "utf-8" },
            );
            const code = out.trim();
            if (code === "200" || code === "202") return `MCP initialize returned HTTP ${code}`;
            throw new Error(`MCP initialize returned HTTP ${code}`);
          },
        ),
      );

      // Format report
      const icon = (ok: boolean) => (ok ? "✅" : "❌");
      const lines = results.map(
        (r, i) => `| ${i + 1} | ${r.label} | ${icon(r.ok)} | ${r.detail} |`,
      );

      const failed = results.filter((r) => !r.ok);
      const allOk = failed.length === 0;
      const header = allOk
        ? "All checks passed."
        : `${failed.length} check(s) failed.`;

      const parts = [
        "## Aura Skills Health Check",
        "",
        header,
        "",
        "| # | Check | Status | Details |",
        "|---|-------|--------|---------|",
        ...lines,
      ];

      if (failed.length > 0) {
        parts.push("", "### How to fix", "");
        for (const f of failed) {
          parts.push(`**${f.label}:**`, f.fix ?? "", "");
        }
      }

      const report = parts.join("\n");
      ctx.ui.notify(report, allOk ? "info" : "warning");
    },
  });
}
