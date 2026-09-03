// In-process HTTP server for the digest dashboard.
// The backing store is in-memory (store.ts): /api/digest serves the
// module-scope currentDigest, /events SSE fans out pushEvent, /api/state POST
// appends in-memory via pushEvent. No file reads or writes.

import { createServer, type Server, type ServerResponse } from "node:http";
import { readFileSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { platform } from "node:process";
import { fileURLToPath } from "node:url";
import os from "node:os";
import type { StateEvent } from "./state.ts";
import {
  getCurrentDigest,
  pushEvent,
  registerSseClient,
} from "./store.ts";

export interface DigestServer {
  port: number;
  url: string;
  server: Server;
  done: () => Promise<void>;
}

export interface StartServerOptions {
  openBrowser?: boolean;
  browserOpener?: (url: string) => void;
}

function readRequestBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function resolveBundles(): { js: string; css: string; missing: string | null } {
  const baseDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [baseDir, path.join(baseDir, "dist")];

  let jsPath: string | null = null;
  let cssPath: string | null = null;
  for (const dir of candidates) {
    const candidateJs = path.join(dir, "app.js");
    if (existsSync(candidateJs)) {
      jsPath = candidateJs;
      cssPath = path.join(dir, "app.css");
      break;
    }
  }

  if (!jsPath) {
    return { js: "", css: "", missing: path.join(baseDir, "app.js") };
  }

  const js = readFileSync(jsPath, "utf-8");
  const css = cssPath && existsSync(cssPath) ? readFileSync(cssPath, "utf-8") : "";
  return { js, css, missing: null };
}

function htmlShell(js: string, css: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Aura Digest</title>
  <style>${css}</style>
</head>
<body>
  <div id="app">Loading…</div>
  <script>${js}</script>
</body>
</html>`;
}

function buildMissingShell(missingPath: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Aura Digest</title>
</head>
<body>
  <div id="app">
    <h1>Build missing</h1>
    <p>The dashboard bundle could not be found at <code>${missingPath}</code>.</p>
    <p>Run <code>npm run build</code> in <code>.pi/extensions/digest-dashboard</code>.</p>
  </div>
</body>
</html>`;
}

export function openBrowser(url: string): void {
  if (process.env.PI_DIGEST_NO_BROWSER === "1") {
    console.error(`openBrowser suppressed (PI_DIGEST_NO_BROWSER=1): ${url}`);
    return;
  }
  const command =
    platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  exec(`${command} ${url}`, (err) => {
    if (err) {
      console.error("openBrowser failed:", err.message);
    }
  });
}

function defaultAuraPaths(): { statePath: string; serverUrlPath: string } {
  const auraDir = path.join(os.homedir(), ".pi", "aura");
  return {
    statePath: path.join(auraDir, "state.json"),
    serverUrlPath: path.join(auraDir, "server-url.json"),
  };
}

export async function startServer(opts: StartServerOptions = {}): Promise<DigestServer> {
  const server = createServer(async (req, res) => {
    try {
      if (req.url === "/" && req.method === "GET") {
        const bundles = resolveBundles();
        if (bundles.missing) {
          const html = buildMissingShell(bundles.missing);
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(html);
          return;
        }

        const html = htmlShell(bundles.js, bundles.css);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      if (req.url === "/api/digest" && req.method === "GET") {
        const digest = getCurrentDigest();
        if (digest === null) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found");
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(digest));
        return;
      }

      if (req.url === "/events" && req.method === "GET") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        });

        const unregister = registerSseClient(res as ServerResponse);
        req.on("close", () => {
          unregister();
        });
        return;
      }

      if (req.url === "/api/state" && req.method === "POST") {
        const body = await readRequestBody(req);
        let parsed: unknown;
        try {
          parsed = JSON.parse(body);
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid JSON" }));
          return;
        }

        pushEvent(parsed as StateEvent);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
    } catch (err) {
      console.error("Server error:", err);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal server error");
    }
  });

  return new Promise((resolve, reject) => {
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      const address = server.address();
      if (!address || typeof address !== "object") {
        server.close();
        return reject(new Error("Server failed to bind"));
      }

      const port = address.port;
      const url = `http://127.0.0.1:${port}/`;

      const done = async (): Promise<void> => {
        return new Promise((res) => {
          server.close((err) => {
            if (err) {
              console.error("Server close error:", err.message);
            }
            res();
          });
        });
      };

      if (opts.openBrowser !== false) {
        const opener = opts.browserOpener ?? openBrowser;
        try {
          opener(url);
        } catch {
          // Best-effort: failures are swallowed.
        }
      }

      resolve({ port, url, server, done });
    });

    server.on("error", reject);
  });
}

// When this module is run directly (as the detached server entry), start the
// server using ~/.pi/aura paths or env overrides.
const modulePath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1];
if (invokedPath && path.resolve(invokedPath) === path.resolve(modulePath)) {
  const defaults = defaultAuraPaths();
  const serverUrlPath = process.env.DASHBOARD_SERVER_URL_PATH ?? defaults.serverUrlPath;
  const statePath = process.env.DASHBOARD_STATE_PATH ?? defaults.statePath;

  // Self-cleanup: delete the server-url.json (+ the state.json the parent
  // wrote) when the server dies, so a killed/crashed server leaves no stale
  // URL for the browser to hit on reload. Covers SIGTERM (graceful teardown
  // from the parent), SIGINT (Ctrl-C), and unexpected exit. Best-effort:
  // a hard SIGKILL or host reboot can't run this, but the parent's
  // teardownDashboard is the backstop for those.
  let shuttingDown = false;
  const cleanup = (): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const f of [serverUrlPath, statePath]) {
      try {
        if (existsSync(f)) rmSync(f, { force: true });
      } catch {
        // ignore — best-effort
      }
    }
  };
  for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"] as const) {
    process.on(sig, () => {
      cleanup();
      process.exit(0);
    });
  }
  process.on("exit", cleanup);
  process.on("beforeExit", cleanup);

  startServer().catch((err) => {
    console.error("Failed to start digest-dashboard server:", err);
    cleanup();
    process.exit(1);
  });
}
