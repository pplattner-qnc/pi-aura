// Public surface of @pi-aura/shared/keyring.

import { FileKeyring } from "./file-keyring.js";
import { MacosKeyring } from "./macos-keyring.js";

/** Closed enumeration of secrets this keyring can store.
 *  Add a union member to add a capable secret. */
export type SecretKey =
  | { service: "aura"; name: "pat" }
  // Atlassian account email. An empty-string stored value round-trips as ""
  // (not null); callers must treat "" as "not set", same convention as the
  // Aura PAT.
  | { service: "atlassian"; name: "email" }
  // Atlassian API token. Same empty-string contract as atlassian/email.
  | { service: "atlassian"; name: "api_token" };

/** One stored secret together with its key. */
export interface StoredSecret {
  key: SecretKey;
  secret: string;
}

/** Platform-agnostic keyring surface. */
export interface Keyring {
  getSecret(key: SecretKey): Promise<string | null>;
  setSecret(key: SecretKey, secret: string): Promise<void>;
  deleteSecret(key: SecretKey): Promise<boolean>;
  listSecrets(): Promise<StoredSecret[]>;
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

/** A D-Bus / Secret Service protocol failure. */
export class KeyringDBusError extends Error {
  readonly code = "KEYRING_DBUS_ERROR" as const;
  constructor(message?: string) {
    super(message ?? "D-Bus keyring error");
    this.name = "KeyringDBusError";
  }
}

/** Create a keyring auto-selected for the current platform.
 *
 *  Uses an inline `switch (process.platform)` so the Linux D-Bus backend
 *  (and its `dbus-next` dependency) is only loaded on Linux via dynamic
 *  `import()`. macOS and file-only paths never evaluate that module graph. */
export async function createKeyring(): Promise<Keyring> {
  switch (process.platform) {
    case "darwin": {
      if (await MacosKeyring.isAvailable()) {
        return new MacosKeyring();
      }
      if (await FileKeyring.isAvailable()) {
        return new FileKeyring();
      }
      throw new KeyringUnavailableError(["MacosKeyring", "FileKeyring"]);
    }
    case "linux": {
      const { SecretServiceKeyring } = await import(
        "./secret-service-keyring.js"
      );
      if (await SecretServiceKeyring.isAvailable()) {
        return new SecretServiceKeyring();
      }
      if (await FileKeyring.isAvailable()) {
        return new FileKeyring();
      }
      throw new KeyringUnavailableError([
        "SecretServiceKeyring",
        "FileKeyring",
      ]);
    }
    default: {
      if (await FileKeyring.isAvailable()) {
        return new FileKeyring();
      }
      throw new KeyringUnavailableError(["FileKeyring"]);
    }
  }
}
