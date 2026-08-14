/**
 * Aura Health Check Extension
 *
 * Registers /aura-skills-health — a diagnostic command that checks whether
 * the Aura MCP is configured in the pi-mcp-adapter and whether mcpx is
 * installed and configured.
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
    description: "Check Aura integration health — MCP adapter config, mcpx CLI, and connectivity",
    handler: async (_args, ctx) => {
      const results: CheckResult[] = [];

      // 1. Pi MCP adapter — aura-mcp-dev in config
      results.push(
        check(
          "Pi MCP adapter configured",
          `Add aura-mcp-dev to ${MCP_CONFIG_PATH}:\n` +
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

      // 3. mcpx installed
      results.push(
        check(
          "mcpx installed",
          "Install mcpx: https://github.com/arcadeai-labs/mcpx",
          () => {
            const path = execSync("which mcpx", { encoding: "utf-8" }).trim();
            const version = execSync("mcpx --version", { encoding: "utf-8" }).trim();
            return `${version} at ${path}`;
          },
        ),
      );

      // 4. mcpx — aura configured
      results.push(
        check(
          "mcpx configured",
          'Add the Aura server to mcpx:\n  mcpx add aura-mcp-dev --url "https://aura.dev-anwalt.de/mcp"',
          () => {
            const out = execSync("mcpx servers --json 2>/dev/null || mcpx servers 2>&1", {
              encoding: "utf-8",
            });
            const servers = JSON.parse(out);
            const aura = servers.find(
              (s: { name?: string }) => s.name === "aura-mcp-dev",
            );
            if (!aura) throw new Error("aura-mcp-dev not in mcpx server list");
            return `url: ${aura.url}`;
          },
        ),
      );

      // 5. mcpx — reachable
      results.push(
        check(
          "mcpx reachable",
          "Check that the Aura server is up and the URL is correct.\n" +
            "  Verify: mcpx ping aura-mcp-dev\n" +
            "  If the URL changed, update with: mcpx remove aura-mcp-dev && mcpx add aura-mcp-dev --url <new-url>",
          () => {
            const out = execSync("mcpx ping aura-mcp-dev 2>&1", {
              encoding: "utf-8",
              timeout: 15000,
            });
            return out.trim();
          },
        ),
      );

      // 6. mcpx — can execute
      results.push(
        check(
          "mcpx can execute",
          "Check authentication. mcpx may need its own auth token.\n" +
            "  Run: mcpx auth aura-mcp-dev\n" +
            "  Or verify the server accepts requests: mcpx exec aura-mcp-dev getBoardSummary",
          () => {
            const out = execSync(
              'mcpx exec aura-mcp-dev getBoardSummary 2>&1 | head -1',
              { encoding: "utf-8", timeout: 15000 },
            );
            if (!out.includes("{")) throw new Error("Unexpected response");
            return "getBoardSummary returned data";
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
