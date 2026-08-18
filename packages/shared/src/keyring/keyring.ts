// Public surface of @pi-aura/shared/keyring.

/** Closed enumeration of secrets this keyring can store.
 *  Add a union member to add a capable secret. */
export type SecretKey = { service: "aura"; name: "pat" };

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

/** Create a keyring auto-selected for the current platform. */
export async function createKeyring(): Promise<Keyring> {
  throw new Error("not implemented");
}
