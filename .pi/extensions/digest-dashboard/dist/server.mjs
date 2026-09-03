// server.ts
import { createServer } from "node:http";
import { readFileSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { platform } from "node:process";
import { fileURLToPath } from "node:url";
import os from "node:os";

// store.ts
var currentDigest = null;
var events = [];
var nextEventId = 1;
var sseClients = /* @__PURE__ */ new Set();
var subscribers = /* @__PURE__ */ new Set();
function getCurrentDigest() {
  return currentDigest;
}
function pushEvent(event) {
  event.id = nextEventId++;
  events.push(event);
  const sseData = `event: state-change
data: {"id":${event.id},"type":"${event.type}"}

`;
  for (const client of sseClients) {
    try {
      client.write(sseData);
    } catch {
    }
  }
  for (const cb of subscribers) {
    try {
      cb(event);
    } catch {
    }
  }
}
function registerSseClient(res) {
  sseClients.add(res);
  return () => {
    sseClients.delete(res);
  };
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
  const baseDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [baseDir, path.join(baseDir, "dist")];
  let jsPath = null;
  let cssPath = null;
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
function defaultAuraPaths() {
  const auraDir = path.join(os.homedir(), ".pi", "aura");
  return {
    statePath: path.join(auraDir, "state.json"),
    serverUrlPath: path.join(auraDir, "server-url.json")
  };
}
async function startServer(opts = {}) {
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
          "Connection": "keep-alive"
        });
        const unregister = registerSseClient(res);
        req.on("close", () => {
          unregister();
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
        pushEvent(parsed);
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
      const done = async () => {
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
var modulePath = fileURLToPath(import.meta.url);
var invokedPath = process.argv[1];
if (invokedPath && path.resolve(invokedPath) === path.resolve(modulePath)) {
  const defaults = defaultAuraPaths();
  const serverUrlPath = process.env.DASHBOARD_SERVER_URL_PATH ?? defaults.serverUrlPath;
  const statePath = process.env.DASHBOARD_STATE_PATH ?? defaults.statePath;
  let shuttingDown = false;
  const cleanup = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const f of [serverUrlPath, statePath]) {
      try {
        if (existsSync(f)) rmSync(f, { force: true });
      } catch {
      }
    }
  };
  for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) {
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
export {
  openBrowser,
  startServer
};
