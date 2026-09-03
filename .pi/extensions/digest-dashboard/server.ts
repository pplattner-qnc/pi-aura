// In-process HTTP server for the digest dashboard.
// The backing store is in-memory (store.ts): /api/digest serves the
// module-scope currentDigest, /events SSE fans out pushEvent, /api/state POST
// appends in-memory via pushEvent. No file reads or writes.

import { createServer, type Server, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { platform } from "node:process";
import { fileURLToPath } from "node:url";
import type { StateEvent } from "./state.ts";
import {
  getCurrentDigest,
  getEvents,
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

      if (req.url === "/api/state" && req.method === "GET") {
        // Serve the in-memory event stream — the browser's loadStateEvents()
        // GETs this on SSE connect + on each state-change to load progress +
        // agent_log events for the live tree + the augment log list. Shape:
        // { events: StateEvent[] } (matches the view's `data?.events ?? []`).
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ events: getEvents() }));
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
          // Close existing (keep-alive) connections first so server.close()
          // resolves promptly — otherwise a lingering /events SSE response keeps
          // the event loop alive until the OS TCP timeout. closeAllConnections()
          // is available on Node >= 18.2 (we target node22).
          server.closeAllConnections();
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

