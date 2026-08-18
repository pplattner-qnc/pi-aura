// Scratch type-check tests for the keyring public surface.
// These are intentionally outside src/ so they are not shipped.

import {
  SecretKey,
  StoredSecret,
  Keyring,
  createKeyring,
  KeyringUnavailableError,
  KeyringLockedError,
  KeyringDBusError,
} from "../src/keyring/index.js";

// Positive: the only valid SecretKey must type-check.
const valid: SecretKey = { service: "aura", name: "pat" };

// Negative: an invalid name must NOT type-check.
// @ts-expect-error name is not a capable secret
const invalidName: SecretKey = { service: "aura", name: "other" };

// Negative: an invalid service must NOT type-check.
// @ts-expect-error service is not a capable secret
const invalidService: SecretKey = { service: "other", name: "pat" };

// Keyring interface shape checks.
declare const keyring: Keyring;
const get: Promise<string | null> = keyring.getSecret(valid);
const set: Promise<void> = keyring.setSecret(valid, "secret");
const del: Promise<boolean> = keyring.deleteSecret(valid);
const list: Promise<StoredSecret[]> = keyring.listSecrets();

// The interface must NOT expose backendId or isAvailable.
// @ts-expect-error backendId must not leak onto the interface
const hasBackendId: unknown = keyring.backendId;
// @ts-expect-error isAvailable must not leak onto the interface
const hasIsAvailable: unknown = keyring.isAvailable;

// Error class shape checks.
declare const unavailable: KeyringUnavailableError;
const code1: "KEYRING_UNAVAILABLE" = unavailable.code;
const tried: string[] = unavailable.tried;

declare const locked: KeyringLockedError;
const code2: "KEYRING_LOCKED" = locked.code;
const backendId: string = locked.backendId;

declare const dbus: KeyringDBusError;
const code3: "KEYRING_DBUS_ERROR" = dbus.code;

// createKeyring returns Promise<Keyring>.
const kr: Promise<Keyring> = createKeyring();

void valid;
void invalidName;
void invalidService;
void get;
void set;
void del;
void list;
void hasBackendId;
void hasIsAvailable;
void code1;
void tried;
void code2;
void backendId;
void code3;
void kr;
