// server.ts
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { readFileSync as readFileSync2, writeFileSync as writeFileSync2, existsSync as existsSync2, mkdirSync as mkdirSync2 } from "node:fs";
import { watch } from "node:fs";
import path2 from "node:path";
import { exec } from "node:child_process";
import { platform } from "node:process";
import { fileURLToPath } from "node:url";

// state.ts
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
var EMPTY_STATE = {
  pid: null,
  server_started: null,
  events: []
};
function ensureDir(filePath) {
  mkdirSync(path.dirname(filePath), { recursive: true });
}
function readState(filePath) {
  if (!existsSync(filePath)) {
    return structuredClone(EMPTY_STATE);
  }
  const raw = readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw);
  return {
    pid: parsed.pid ?? null,
    server_started: parsed.server_started ?? null,
    events: parsed.events ?? []
  };
}
function appendEvent(filePath, event) {
  ensureDir(filePath);
  const state = existsSync(filePath) ? readState(filePath) : structuredClone(EMPTY_STATE);
  state.events.push(event);
  writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
}

// server.ts
function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}
function resolveBundles() {
  const baseDir = path2.dirname(fileURLToPath(import.meta.url));
  const candidates = [baseDir, path2.join(baseDir, "dist")];
  let jsPath = null;
  let cssPath = null;
  for (const dir of candidates) {
    const candidateJs = path2.join(dir, "app.js");
    if (existsSync2(candidateJs)) {
      jsPath = candidateJs;
      cssPath = path2.join(dir, "app.css");
      break;
    }
  }
  if (!jsPath) {
    return { js: "", css: "", missing: path2.join(baseDir, "app.js") };
  }
  const js = readFileSync2(jsPath, "utf-8");
  const css = cssPath && existsSync2(cssPath) ? readFileSync2(cssPath, "utf-8") : "";
  return { js, css, missing: null };
}
function htmlShell(js, css) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Aura Digest</title>
  <style>${css}</style>
</head>
<body>
  <div id="app">Loading\u2026</div>
  <script>${js}</script>
</body>
</html>`;
}
function buildMissingShell(missingPath) {
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
function openBrowser(url) {
  if (process.env.PI_DIGEST_NO_BROWSER === "1") {
    console.error(`openBrowser suppressed (PI_DIGEST_NO_BROWSER=1): ${url}`);
    return;
  }
  const command = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  exec(`${command} ${url}`, (err) => {
    if (err) {
      console.error("openBrowser failed:", err.message);
    }
  });
}
async function startServer(opts) {
  const watchers = [];
  const server = createServer(async (req, res) => {
    try {
      if (req.url === "/" && req.method === "GET") {
        const bundles = resolveBundles();
        if (bundles.missing) {
          const html2 = buildMissingShell(bundles.missing);
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(html2);
          return;
        }
        const html = htmlShell(bundles.js, bundles.css);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }
      if (req.url === "/api/digest" && req.method === "GET") {
        try {
          const s = await stat(opts.dashboardPath);
          if (!s.isFile()) {
            throw new Error("not a file");
          }
          const json = await readFile(opts.dashboardPath, "utf-8");
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(json);
          return;
        } catch {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found");
          return;
        }
      }
      if (req.url === "/events" && req.method === "GET") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive"
        });
        const watcher = watch(opts.dashboardPath, (eventType) => {
          if (eventType === "change") {
            res.write("event: change\ndata: {}\n\n");
          }
        });
        watchers.push(watcher);
        req.on("close", () => {
          watcher.close();
          const idx = watchers.indexOf(watcher);
          if (idx !== -1) watchers.splice(idx, 1);
        });
        return;
      }
      if (req.url === "/api/state" && req.method === "POST") {
        const body = await readRequestBody(req);
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid JSON" }));
          return;
        }
        appendEvent(opts.statePath, parsed);
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
      const serverUrlPayload = { url, pid: process.pid };
      mkdirSync2(path2.dirname(opts.serverUrlPath), { recursive: true });
      writeFileSync2(opts.serverUrlPath, JSON.stringify(serverUrlPayload, null, 2), "utf-8");
      console.log(url);
      const done = async () => {
        for (const w of watchers.slice()) {
          w.close();
        }
        watchers.length = 0;
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
        }
      }
      resolve({ port, url, server, done });
    });
    server.on("error", reject);
  });
}
export {
  openBrowser,
  startServer
};
