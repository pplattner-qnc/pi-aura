// Unit tests for resolveAuraCredentials — the shared credential helper.
//
// Seam: resolveAuraCredentials() returns { baseUrl, pat } by reusing
// loadAuraClientSettings() + createKeyring().getSecret({service:"aura",name:"pat"}).
// Throws the same actionable errors as createDefaultAuraClient() for
// missing baseUrl / missing PAT.
//
// The function accepts optional injection points for testability:
//   - settingsPath: override the settings.json path (passed to loadAuraClientSettings)
//   - keyring: inject a fake Keyring instead of calling createKeyring()
//
// Run with: npx tsx --test test/aura-credentials.test.ts

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveAuraCredentials } from "../src/aura-credentials.js";
import type { Keyring, StoredSecret, SecretKey } from "../src/keyring/index.js";

// --- Fake keyring ---

class FakeKeyring implements Keyring {
  constructor(private readonly pat: string | null) {}
  async getSecret(key: SecretKey): Promise<string | null> {
    assert.equal(key.service, "aura");
    assert.equal(key.name, "pat");
    return this.pat;
  }
  async setSecret(_key: SecretKey, _secret: string): Promise<void> {}
  async deleteSecret(_key: SecretKey): Promise<boolean> { return true; }
  async listSecrets(): Promise<StoredSecret[]> { return []; }
}

// --- Settings fixture helper ---

function makeSettingsFile(baseUrl?: string): string {
  const dir = join(tmpdir(), `aura-creds-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const settingsPath = join(dir, "settings.json");
  const settings: Record<string, unknown> = {};
  if (baseUrl !== undefined) settings.aura = { baseUrl };
  else settings.aura = {};
  writeFileSync(settingsPath, JSON.stringify(settings), "utf8");
  return settingsPath;
}

function makeMissingSettings(): string {
  const dir = join(tmpdir(), `aura-creds-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  // No settings.json at all
  return join(dir, "settings.json");
}

const cleanupDirs: string[] = [];

function trackCleanup(path: string): string {
  const dir = path.substring(0, path.lastIndexOf("/"));
  cleanupDirs.push(dir);
  return path;
}

afterEach(() => {
  for (const dir of cleanupDirs) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  cleanupDirs.length = 0;
});

// --- Tests ---

describe("resolveAuraCredentials", () => {
  it("returns { baseUrl, pat } when both are configured", async () => {
    const settingsPath = trackCleanup(makeSettingsFile("https://aura.example.com/api"));
    const result = await resolveAuraCredentials({
      settingsPath,
      keyring: new FakeKeyring("test-pat-123"),
    });
    assert.equal(result.baseUrl, "https://aura.example.com/api");
    assert.equal(result.pat, "test-pat-123");
  });

  it("throws actionable error for missing baseUrl", async () => {
    const settingsPath = trackCleanup(makeSettingsFile(undefined));
    await assert.rejects(
      () => resolveAuraCredentials({
        settingsPath,
        keyring: new FakeKeyring("test-pat"),
      }),
      /Missing.*baseUrl.*settings\.json/i,
      "should mention missing baseUrl in settings.json",
    );
  });

  it("throws actionable error when settings.json has no aura block", async () => {
    const settingsPath = trackCleanup(makeMissingSettings());
    await assert.rejects(
      () => resolveAuraCredentials({
        settingsPath,
        keyring: new FakeKeyring("test-pat"),
      }),
      /Missing.*baseUrl.*settings\.json/i,
      "should mention missing baseUrl when settings.json is absent",
    );
  });

  it("throws actionable error for missing PAT (keyring returns null)", async () => {
    const settingsPath = trackCleanup(makeSettingsFile("https://aura.example.com/api"));
    await assert.rejects(
      () => resolveAuraCredentials({
        settingsPath,
        keyring: new FakeKeyring(null),
      }),
      (err: Error) => {
        assert.match(err.message, /No Aura PAT found/i, "should mention PAT");
        assert.match(err.message, /\/aura secrets discover/, "should mention the fix command");
        return true;
      },
    );
  });

  it("reuses the same error messages as createDefaultAuraClient", async () => {
    // The missing baseUrl error must match createDefaultAuraClient's message format.
    const settingsPath = trackCleanup(makeSettingsFile(undefined));
    await assert.rejects(
      () => resolveAuraCredentials({
        settingsPath,
        keyring: new FakeKeyring("pat"),
      }),
      /aura\.baseUrl/i,
      "should reference aura.baseUrl specifically",
    );
  });
});
