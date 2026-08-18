// Internal exec helpers used by the macOS security backend.
// Not exported from the public keyring barrel.

import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, statSync } from "node:fs";

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Run a command, returning {stdout, stderr, exitCode}. Maps a missing
 * binary (ENOENT/EACCES) to ToolMissingError; non-zero exits in
 * `ignoreExitCodes` are returned as normal results instead of thrown.
 * Uses `spawn` directly so we can write `opts.input` to the child's stdin
 * (promisified `execFile` doesn't accept an `input` option). */
export function run(
  file: string,
  args: string[],
  opts: { input?: string; ignoreExitCodes?: Set<number> } = {},
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
    child.on("error", (e: NodeJS.ErrnoException) => {
      if (e.code === "ENOENT" || e.code === "EACCES") {
        reject(new ToolMissingError(file, e.message ?? e.code ?? "spawn error"));
      } else {
        reject(e);
      }
    });
    child.on("close", (exitCode: number | null) => {
      const code = exitCode ?? 1;
      if (opts.ignoreExitCodes?.has(code)) {
        resolve({ stdout, stderr, exitCode: code });
        return;
      }
      if (code === 0) {
        resolve({ stdout, stderr, exitCode: 0 });
        return;
      }
      reject(new ExecError(file, args, code, stderr, stdout));
    });
    if (opts.input !== undefined) {
      child.stdin.on("error", () => { /* swallow EPIPE if child exits early */ });
      child.stdin.end(opts.input, "utf8");
    } else {
      child.stdin.end();
    }
  });
}

export class ToolMissingError extends Error {
  readonly code = "TOOL_MISSING" as const;
  readonly tool: string;
  constructor(tool: string, message: string) {
    super(message);
    this.name = "ToolMissingError";
    this.tool = tool;
  }
}

export class ExecError extends Error {
  readonly exitCode: number;
  readonly cmd: string;
  readonly stderr: string;
  readonly stdout: string;
  constructor(file: string, args: string[], exitCode: number, stderr: string, stdout: string) {
    super(`${file} ${args.join(" ")} exited ${exitCode}: ${stderr.slice(0, 500)}`);
    this.name = "ExecError";
    this.exitCode = exitCode;
    this.cmd = `${file} ${args.join(" ")}`;
    this.stderr = stderr;
    this.stdout = stdout;
  }
}

/** Best-effort resolution of a binary that may live in the Nix store but not
 * on PATH. `extraPaths` may be either directories (probed as dir/name) or full
 * file paths (probed as-is, e.g. a /nix/store path). Returns the first
 * existing path, or the bare name (letting spawn ENOENT upstream, which we
 * map to ToolMissingError). */
export function resolveBinary(name: string, extraPaths: string[] = []): string {
  if (existsSync(name)) return name;
  const dirs = [
    ...extraPaths,
    "/run/wrappers/bin",
    "/run/current-system/sw/bin",
    "/usr/bin",
    "/usr/local/bin",
    join(homedir(), ".nix-profile/bin"),
    join(homedir(), ".local/bin"),
  ];
  for (const dir of dirs) {
    // `dir` may already be a full file path (extraPaths hits from /nix/store).
    if (existsSync(dir) && isFile(dir)) return dir;
    const p = join(dir, name);
    if (existsSync(p)) return p;
  }
  return name;
}

/** True iff `p` exists and is a file (not a directory). */
export function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}
