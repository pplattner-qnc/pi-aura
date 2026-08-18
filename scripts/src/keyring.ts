// keyring.ts — pure-JS, cross-platform keyring provider (no native bindings).
//
// Backends shell out to OS tools the user has already authenticated / unlocked,
// so there is no node-gyp / N-API build and nothing breaks under Bun or a
// bundled binary. The Linux backend speaks the Secret Service spec via
// `secret-tool` (libsecret), which fronts GNOME Keyring, KDE Wallet, and any
// other Secret Service implementation.
//
// Surface:
//   const keyring = await createKeyring("pi-aura-scripts");
//   await keyring.setSecret("atlassian", "<token>");
//   const token = await keyring.getSecret("atlassian"); // "<token>" | null
//   await keyring.deleteSecret("atlassian");
//   const all = await keyring.listSecrets();             // [{account, secret}, ...]
//
// `service` is bound at construction and embedded in the returned Keyring;
// callers only ever pass the per-secret `account` name.

import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync, chmodSync, statSync } from "node:fs";
import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** One stored secret, scoped to this keyring's service. */
export interface StoredSecret {
  account: string;
  secret: string;
}

/** No backend can run on this machine (platform unsupported or tool missing). */
export class KeyringUnavailableError extends Error {
  readonly code = "KEYRING_UNAVAILABLE" as const;
  readonly tried: string[];
  constructor(tried: string[], message?: string) {
    super(message ?? `No keyring backend available. Tried: ${tried.join(", ")}`);
    this.name = "KeyringUnavailableError";
    this.tried = tried;
  }
}

/** A backend exists but the keyring is locked / daemon unreachable. */
export class KeyringLockedError extends Error {
  readonly code = "KEYRING_LOCKED" as const;
  readonly backendId: string;
  constructor(backendId: string, message: string) {
    super(message);
    this.name = "KeyringLockedError";
    this.backendId = backendId;
  }
}

/**
 * One storage strategy per platform. Service-agnostic and stateless: the
 * facade binds the service and forwards it, so backends are easy to unit
 * test (inject a fake) and never hold per-instance state.
 */
export interface KeyringBackend {
  /** "macos-keychain" | "secret-service" | "windows-credman" | "file". */
  readonly id: string;
  /** True iff this backend can run HERE (platform matches + tool present + unlocked). */
  isAvailable(): Promise<boolean>;
  getSecret(service: string, account: string): Promise<string | null>;
  setSecret(service: string, account: string, secret: string): Promise<void>;
  deleteSecret(service: string, account: string): Promise<boolean>;
  listSecrets(service: string): Promise<StoredSecret[]>;
}

/**
 * High-level facade. Service is embedded at creation; methods take only the
 * per-secret `account` name. Auto-selects the best available backend.
 */
export interface Keyring {
  /** id of the active backend (for diagnostics). */
  readonly backendId: string;
  getSecret(account: string): Promise<string | null>;
  setSecret(account: string, secret: string): Promise<void>;
  deleteSecret(account: string): Promise<boolean>;
  listSecrets(): Promise<StoredSecret[]>;
}

/**
 * Create a keyring bound to `service` (e.g. "pi-aura-scripts").
 * Auto-resolves the best backend for this machine in priority order.
 * @throws {KeyringUnavailableError} if no backend can run here.
 */
export async function createKeyring(service: string): Promise<Keyring> {
  const tried: string[] = [];
  for (const make of BACKEND_FACTORIES) {
    const backend = make();
    tried.push(backend.id);
    try {
      if (await backend.isAvailable()) {
        return new KeyringImpl(backend, service);
      }
    } catch {
      // isAvailable threw (e.g. keyring locked) -> not usable, try the next.
    }
  }
  throw new KeyringUnavailableError(tried);
}

// ---------------------------------------------------------------------------
// Facade
// ---------------------------------------------------------------------------

class KeyringImpl implements Keyring {
  private readonly backend: KeyringBackend;
  private readonly service: string;
  constructor(backend: KeyringBackend, service: string) {
    this.backend = backend;
    this.service = service;
  }
  get backendId(): string {
    return this.backend.id;
  }
  getSecret(account: string): Promise<string | null> {
    return this.backend.getSecret(this.service, account);
  }
  setSecret(account: string, secret: string): Promise<void> {
    return this.backend.setSecret(this.service, account, secret);
  }
  deleteSecret(account: string): Promise<boolean> {
    return this.backend.deleteSecret(this.service, account);
  }
  listSecrets(): Promise<StoredSecret[]> {
    return this.backend.listSecrets(this.service);
  }
}

// ---------------------------------------------------------------------------
// Exec helpers
// ---------------------------------------------------------------------------

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Run a command, returning {stdout, stderr, exitCode}. Maps a missing
 * binary (ENOENT/EACCES) to ToolMissingError; non-zero exits in
 * `ignoreExitCodes` are returned as normal results instead of thrown.
 * Uses `spawn` directly so we can write `opts.input` to the child's stdin
 * (promisified `execFile` doesn't accept an `input` option). */
function run(
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

class ToolMissingError extends Error {
  readonly code = "TOOL_MISSING" as const;
  readonly tool: string;
  constructor(tool: string, message: string) {
    super(message);
    this.name = "ToolMissingError";
    this.tool = tool;
  }
}

class ExecError extends Error {
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
 * file paths (probed as-is, e.g. the libsecret-<ver>/bin/secret-tool hits we
 * discovered under /nix/store). Returns the first existing path, or the bare
 * name (letting execFile ENOENT upstream, which we map to ToolMissingError). */
function resolveBinary(name: string, extraPaths: string[] = []): string {
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
function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Backend: macOS Keychain (`security` CLI)
// ---------------------------------------------------------------------------

class MacosKeychainBackend implements KeyringBackend {
  readonly id = "macos-keychain";

  private security(args: string[], input?: string, ignoreExit?: Set<number>): Promise<ExecResult> {
    return run("/usr/bin/security", args, { input, ignoreExitCodes: ignoreExit });
  }

  async isAvailable(): Promise<boolean> {
    if (process.platform !== "darwin") return false;
    try {
      await this.security(["-h"], undefined, new Set([0, 1, 2]));
      return true;
    } catch {
      return false;
    }
  }

  async getSecret(service: string, account: string): Promise<string | null> {
    // `security find-generic-password -s <service> -a <account> -w` exits 0
    // with the password on stdout, or 44 (secItemNotFound) if absent.
    const res = await this.security(
      ["find-generic-password", "-s", service, "-a", account, "-w"],
      undefined,
      new Set([44]),
    );
    if (res.exitCode === 44) return null;
    return res.stdout.replace(/\r?\n$/, "");
  }

  async setSecret(service: string, account: string, secret: string): Promise<void> {
    // delete-if-exists then add-generic-password (no upsert primitive).
    await this.security(["delete-generic-password", "-s", service, "-a", account], undefined, new Set([44, 128]));
    await this.security(["add-generic-password", "-s", service, "-a", account, "-w", secret]);
  }

  async deleteSecret(service: string, account: string): Promise<boolean> {
    const res = await this.security(
      ["delete-generic-password", "-s", service, "-a", account],
      undefined,
      new Set([44, 128]),
    );
    return res.exitCode === 0;
  }

  async listSecrets(service: string): Promise<StoredSecret[]> {
    // `security dump-keychain` then match svce/acct attributes per block.
    // The CLI has no per-service list primitive; this is the same approach
    // node-keytar takes internally.
    const res = await this.security(["dump-keychain"], undefined, new Set([0]));
    const out: StoredSecret[] = [];
    const blocks = res.stdout.split(/(?=^keychain: ")/m);
    for (const block of blocks) {
      const svce = block.match(/"svce"<blob>="([^"]*)"/);
      const acct = block.match(/"acct"<blob>="([^"]*)"/);
      if (svce && svce[1] === service && acct) {
        const secret = await this.getSecret(service, acct[1]); // per-match read avoids storing the dump
        if (secret !== null) out.push({ account: acct[1], secret });
      }
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Backend: Linux Secret Service (`secret-tool`, libsecret)
// ---------------------------------------------------------------------------

class SecretServiceBackend implements KeyringBackend {
  readonly id = "secret-service";
  private secretToolPath: string | null = null;

  private resolve(): string {
    if (this.secretToolPath !== null) return this.secretToolPath;
    // secret-tool is often not on PATH on NixOS even when libsecret is
    // installed (the binary lives in a nix-store path). Probe a few standard
    // locations plus every libsecret-<ver>/bin/secret-tool under /nix/store.
    this.secretToolPath = resolveBinary("secret-tool", this.nixSecretToolPaths());
    return this.secretToolPath;
  }

  /** Find secret-tool binaries under /nix/store (libsecret-<ver>/bin/secret-tool).
   * NixOS store dirs are named <hash>-libsecret-<ver>, so we match on the
   * embedded package name, not a prefix. */
  private nixSecretToolPaths(): string[] {
    const found: string[] = [];
    try {
      for (const dir of readdirSync("/nix/store")) {
        if (!dir.includes("-libsecret-")) continue;
        const p = join("/nix/store", dir, "bin", "secret-tool");
        if (existsSync(p)) found.push(p);
      }
    } catch {
      // /nix/store unreadable or absent (non-NixOS) -> no extra candidates.
    }
    return found;
  }

  async isAvailable(): Promise<boolean> {
    if (process.platform !== "linux") return false;
    try {
      const bin = this.resolve();
      // `secret-tool search` reaches the Secret Service. A missing tool
      // surfaces as ToolMissingError; a locked keyring as ExecError. Both
      // are treated as "not available" so the facade falls through.
      await run(bin, ["search", "--all", "service", "x-pi-aura-keyring-probe"], {
        ignoreExitCodes: new Set([0, 1]),
      });
      return true;
    } catch {
      return false;
    }
  }

  async getSecret(service: string, account: string): Promise<string | null> {
    const bin = this.resolve();
    const res = await run(bin, ["lookup", "service", service, "account", account], {
      ignoreExitCodes: new Set([0, 1]),
    });
    if (res.exitCode !== 0) return null;
    return res.stdout.replace(/\n$/, "");
  }

  async setSecret(service: string, account: string, secret: string): Promise<void> {
    const bin = this.resolve();
    // secret-tool has no upsert: clear any existing entry, then store. The
    // value is read from stdin. Keep the account index in sync so listSecrets
    // can map secrets back to accounts.
    await run(bin, ["clear", "service", service, "account", account], {
      ignoreExitCodes: new Set([0, 1]),
    });
    await run(bin, ["store", "--label", `${service}/${account}`, "service", service, "account", account], {
      input: secret,
    });
    this.addToIndex(service, account);
  }

  async deleteSecret(service: string, account: string): Promise<boolean> {
    const bin = this.resolve();
    const res = await run(bin, ["clear", "service", service, "account", account], {
      ignoreExitCodes: new Set([0, 1]),
    });
    if (res.exitCode !== 0) return false;
    // secret-tool clear exits 0 whether or not anything matched, so re-lookup
    // to report a truthful boolean.
    const deleted = (await this.getSecret(service, account)) === null;
    if (deleted) this.removeFromIndex(service, account);
    return deleted;
  }

  async listSecrets(service: string): Promise<StoredSecret[]> {
    // `secret-tool search --all service <service>` returns every matching
    // item but does NOT print the attribute pairs, so we can't recover the
    // account from the search output alone. We keep a tiny side index (a
    // JSON file) that setSecret/deleteSecret maintain; listSecrets pairs the
    // indexed accounts with the secrets returned by search, positionally.
    //
    // Accounts written by other tools (node-keytar, @napi-rs/keyring) won't be
    // in the index; for those, listSecrets returns account="" so the caller
    // still gets the secret values. This matches keytar's findCredentials,
    // which on Linux also requires the account to be known.
    const bin = this.resolve();
    const res = await run(bin, ["search", "--all", "service", service], {
      ignoreExitCodes: new Set([0, 1]),
    });
    if (res.exitCode !== 0) return [];
    const secrets = res.stdout.split(/\n\n+/).map((b) => b.replace(/\n$/, "")).filter((b) => b.length > 0);
    const indexed = this.readAccountIndex(service);
    return secrets.map((s, i) => ({ account: indexed[i] ?? "", secret: s }));
  }

  // -- account side-index (the only local state in this backend) ------------

  private indexDir(): string {
    return join(homedir(), ".cache", "pi-aura-keyring");
  }
  private indexPath(service: string): string {
    const slug = createHash("sha256").update(service, "utf8").digest("hex").slice(0, 16);
    return join(this.indexDir(), `accounts-${slug}.json`);
  }
  private readAccountIndex(service: string): string[] {
    const p = this.indexPath(service);
    if (!existsSync(p)) return [];
    try {
      return JSON.parse(readFileSync(p, "utf8")) as string[];
    } catch {
      return [];
    }
  }
  private writeAccountIndex(service: string, accounts: string[]): void {
    mkdirSync(this.indexDir(), { recursive: true });
    writeFileSync(this.indexPath(service), JSON.stringify(accounts, null, 2) + "\n", "utf8");
  }
  private addToIndex(service: string, account: string): void {
    const cur = this.readAccountIndex(service);
    if (!cur.includes(account)) {
      cur.push(account);
      this.writeAccountIndex(service, cur);
    }
  }
  private removeFromIndex(service: string, account: string): void {
    this.writeAccountIndex(service, this.readAccountIndex(service).filter((x) => x !== account));
  }
}

// ---------------------------------------------------------------------------
// Backend: Windows Credential Manager (PowerShell + cmdkey)
// ---------------------------------------------------------------------------

class WindowsCredmanBackend implements KeyringBackend {
  readonly id = "windows-credman";

  private powershell(script: string): Promise<ExecResult> {
    return run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      ignoreExitCodes: new Set([0, 1]),
    });
  }

  async isAvailable(): Promise<boolean> {
    if (process.platform !== "win32") return false;
    try {
      const res = await this.powershell("Write-Output ok");
      return res.stdout.trim() === "ok";
    } catch {
      return false;
    }
  }

  async getSecret(_service: string, _account: string): Promise<string | null> {
    // Reading a credential's password requires CredRead (advapi32) via a
    // PowerShell P/Invoke — cmdkey /list only shows metadata. The struct
    // decode is non-trivial and not testable from Linux, so this is left as
    // a clearly-marked stub to be filled in on a Windows host rather than
    // ship an untested reader.
    throw new Error("WindowsCredmanBackend.getSecret: not implemented (requires CredRead P/Invoke)");
  }

  async setSecret(service: string, account: string, secret: string): Promise<void> {
    const target = this.target(service, account);
    // cmdkey /add creates a Generic credential with a plaintext password.
    await this.powershell(
      `cmdkey /add:${JSON.stringify(target)} /user:${JSON.stringify(account)} /pass:${JSON.stringify(secret)}`,
    );
  }

  async deleteSecret(service: string, account: string): Promise<boolean> {
    const target = this.target(service, account);
    const res = await this.powershell(`cmdkey /delete:${JSON.stringify(target)}`);
    return res.exitCode === 0;
  }

  async listSecrets(service: string): Promise<StoredSecret[]> {
    const res = await this.powershell(
      `cmdkey /list | Select-String 'Target:' | Where-Object { $_.ToString() -like '*${service}*' }`,
    );
    const out: StoredSecret[] = [];
    for (const line of res.stdout.split(/\r?\n/)) {
      const m = line.match(/Target:\s*(.+)/);
      if (!m) continue;
      const account = m[1].trim().slice(service.length + 1);
      const secret = await this.getSecret(service, account);
      if (secret !== null) out.push({ account, secret });
    }
    return out;
  }

  private target(service: string, account: string): string {
    return `${service}/${account}`;
  }
}

// ---------------------------------------------------------------------------
// Backend: file (headless / CI / no-keyring fallback)
// ---------------------------------------------------------------------------

class FileBackend implements KeyringBackend {
  readonly id = "file";
  private dir = join(homedir(), ".cache", "pi-aura-keyring");

  private storePath(service: string): string {
    const slug = createHash("sha256").update(service, "utf8").digest("hex").slice(0, 16);
    return join(this.dir, `store-${slug}.json`);
  }

  private load(service: string): Record<string, string> {
    const p = this.storePath(service);
    if (!existsSync(p)) return {};
    try {
      return JSON.parse(readFileSync(p, "utf8")) as Record<string, string>;
    } catch {
      return {};
    }
  }

  private save(service: string, data: Record<string, string>): void {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.storePath(service), JSON.stringify(data, null, 2) + "\n", "utf8");
    // Tighten perms on the store file; ignore errors on platforms that
    // don't support chmod (the store still works, just world-readable).
    try {
      chmodSync(this.storePath(service), 0o600);
    } catch {
      // ignore
    }
  }

  async isAvailable(): Promise<boolean> {
    // Always available — it's just a file. The facade tries it last so a real
    // OS keyring is preferred when present.
    return true;
  }

  async getSecret(service: string, account: string): Promise<string | null> {
    return this.load(service)[account] ?? null;
  }

  async setSecret(service: string, account: string, secret: string): Promise<void> {
    const data = this.load(service);
    data[account] = secret;
    this.save(service, data);
  }

  async deleteSecret(service: string, account: string): Promise<boolean> {
    const data = this.load(service);
    if (!(account in data)) return false;
    delete data[account];
    this.save(service, data);
    return true;
  }

  async listSecrets(service: string): Promise<StoredSecret[]> {
    const data = this.load(service);
    return Object.entries(data).map(([account, secret]) => ({ account, secret }));
  }

  /** Remove the store file for a service (test/repair helper). */
  reset(service: string): void {
    rmSync(this.storePath(service), { force: true });
  }
}

// ---------------------------------------------------------------------------
// Backend registry (priority order: OS keyrings first, file fallback last)
// ---------------------------------------------------------------------------

const BACKEND_FACTORIES: Array<() => KeyringBackend> = [
  () => new MacosKeychainBackend(),
  () => new SecretServiceBackend(),
  () => new WindowsCredmanBackend(),
  () => new FileBackend(),
];
