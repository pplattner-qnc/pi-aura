/**
 * Aura Secrets Extension
 *
 * Registers the `/aura` slash-command with `secrets` subcommands for managing
 * the Aura PAT in the OS keyring.
 *
 * Slice 1 (aura-command-skeleton) implements the command skeleton, subcommand
 * dispatch, and completions. Slice 2 (secrets-discover) implements the
 * extensible discovery-source registry and the import offer flow.
 */

import type { ExtensionAPI, ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import type { SecretKey, Keyring } from "@pi-aura/shared/keyring";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type AuraSubcommand = "secrets-discover" | "secrets-edit" | "usage";

export interface ParsedAuraArgs {
  command: AuraSubcommand;
  rest: string;
}

export function parseAuraArgs(args: string): ParsedAuraArgs {
  const tokens = args.trim().split(/\s+/).filter(Boolean);

  if (tokens.length === 0) {
    return { command: "usage", rest: "" };
  }

  if (tokens[0] !== "secrets") {
    return { command: "usage", rest: tokens.join(" ") };
  }

  if (tokens.length === 1) {
    return { command: "usage", rest: "secrets" };
  }

  const sub = tokens[1];
  const rest = tokens.slice(2).join(" ");

  if (sub === "discover") {
    return { command: "secrets-discover", rest };
  }

  if (sub === "edit") {
    return { command: "secrets-edit", rest };
  }

  return { command: "usage", rest: `${tokens[0]} ${sub}` };
}

/** A source that can discover an Aura PAT from some external location. */
export interface DiscoverySource {
  name: string;
  find(): Promise<string | null>;
}

/** One discovered PAT together with the source that produced it. */
export interface DiscoveredPat {
  name: string;
  value: string;
}

const MCP_CONFIG_PATH = join(homedir(), ".config", "mcp", "mcp.json");

/** Read the aura-mcp-dev bearerToken from an mcp.json file.
 *
 *  Returns null if the file is missing, unparseable, or has no entry/token.
 *  Exported for unit testing so tests can use temporary files. */
export function readMcpBearerToken(path: string = MCP_CONFIG_PATH): string | null {
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;

    const servers = (parsed as Record<string, unknown>).mcpServers as
      | Record<string, { bearerToken?: unknown }>
      | undefined;
    if (!servers || typeof servers !== "object") return null;

    const auraServer = servers["aura-mcp-dev"];
    if (!auraServer || typeof auraServer !== "object") return null;

    const token = auraServer.bearerToken;
    return typeof token === "string" && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

/** Extensible registry of discovery sources.
 *
 *  New sources can be added by appending a `DiscoverySource` object. */
export const DISCOVERY_SOURCES: DiscoverySource[] = [
  {
    name: "mcp-json",
    async find() {
      return readMcpBearerToken();
    },
  },
];

/** Pure function that runs all sources and returns only the found PATs.
 *
 *  Unit-testable without a pi session or keyring. */
export async function discoverPat(sources: DiscoverySource[]): Promise<DiscoveredPat[]> {
  const found: DiscoveredPat[] = [];
  for (const source of sources) {
    const value = await source.find();
    if (value !== null && value !== undefined && value !== "") {
      found.push({ name: source.name, value });
    }
  }
  return found;
}

const AURA_PAT_KEY: SecretKey = { service: "aura", name: "pat" };

/** Labels shown in the /aura secrets edit chooser. The standalone
 *  "Atlassian email" item is GONE — the email is prompted within the
 *  combined flow for each Atlassian token. The two Atlassian token labels
 *  are distinct so the user can tell them apart. */
const SECRET_LABELS = [
  "Aura PAT",
  "Atlassian Teamwork Graph token",
  "Atlassian Bitbucket token",
] as const;

/** Prefill placeholders for each editable secret. The email placeholder is
 *  keyed by the email secret's label, used by the combined flow. */
const SECRET_PLACEHOLDERS: Record<string, string> = {
  "Aura PAT": "<paste your Aura PAT here>",
  "Atlassian email": "<paste your Atlassian email here>",
  "Atlassian Teamwork Graph token": "<paste your Atlassian Teamwork Graph API token here>",
  "Atlassian Bitbucket token": "<paste your Atlassian Bitbucket API token here>",
};

/** Map a chooser label to the SecretKey it corresponds to.
 *
 *  Pure single-key lookup, unit-testable without a pi session or keyring.
 *  Maps the two Atlassian token labels to their token keys; Aura PAT is
 *  unchanged. Returns null for cancel (undefined) or an unknown label. */
export function pickSecretKey(choice: string | undefined): SecretKey | null {
  switch (choice) {
    case "Aura PAT":
      return { service: "aura", name: "pat" };
    case "Atlassian Teamwork Graph token":
      return { service: "atlassian", name: "api_token" };
    case "Atlassian Bitbucket token":
      return { service: "atlassian", name: "bitbucket_token" };
    default:
      return null;
  }
}

/** Decision produced by `decideEditAction` for the edit handler. */
export type EditDecision =
  | { action: "cancel" }
  | { action: "unchanged" }
  | { action: "save"; value: string }
  | { action: "confirm-empty" };

/** Pure function deciding what to do after the user edits the PAT.
 *
 *  Unit-testable without a pi session or keyring. */
export function decideEditAction(
  current: string | null,
  edited: string | undefined | null
): EditDecision {
  if (edited === undefined || edited === null) {
    return { action: "cancel" };
  }
  if (edited === current) {
    return { action: "unchanged" };
  }
  if (edited === "") {
    return { action: "confirm-empty" };
  }
  return { action: "save", value: edited };
}

/** Thin UI wrapper around `decideEditAction`.
 *
 *  Opens the editor prefilled with the current value (or a placeholder),
 *  asks for confirmation when storing an empty value, and writes the result
 *  back to the keyring. Guards for cancel/non-TUI mode.
 *
 *  Generalized in slice 3 (aura-secrets-edit-picker) to accept the SecretKey,
 *  label, and placeholder as parameters so the chooser can route any of the
 *  three editable secrets through the same edit flow. `decideEditAction` is
 *  unchanged. */
export async function handleEdit(
  ui: Pick<ExtensionUIContext, "notify" | "editor" | "confirm">,
  keyringFactory: () => Promise<Keyring>,
  current: string | null,
  key: SecretKey = AURA_PAT_KEY,
  label: string = "Aura PAT",
  placeholder: string = "<paste your Aura PAT here>"
): Promise<void> {
  const edited = await ui.editor(label, current ?? placeholder);

  const decision = decideEditAction(current, edited);

  switch (decision.action) {
    case "cancel":
      ui.notify("no change", "info");
      return;
    case "unchanged":
      ui.notify("unchanged", "info");
      return;
    case "confirm-empty": {
      const confirmed = await ui.confirm(
        `Save empty ${label}?`,
        `An empty ${label} won't authenticate. Save anyway?`
      );
      if (!confirmed) {
        ui.notify("no change", "info");
        return;
      }
      // fall through to save the empty string
      break;
    }
    case "save":
      break;
  }

  const value = decision.action === "save" ? decision.value : "";
  const keyring = await keyringFactory();
  await keyring.setSecret(key, value);
  ui.notify("saved", "info");
}

/** Combined email+token flow for an Atlassian PAT.
 *
 *  Prompts for the email (prefilled with the current `atlassian/email` if
 *  set), then prompts for the token (prefilled with the current token if
 *  set), storing each via the existing `handleEdit` primitive.
 *
 *  Atomicity contract: a cancel at either prompt aborts the WHOLE PAT
 *  provisioning — no email-without-token or token-without-email is left
 *  behind. Because `handleEdit` writes immediately on save, this function
 *  cannot call `handleEdit` for the email and then check whether the token
 *  was cancelled (the email would already be persisted). Instead it opens
 *  both editors and runs `decideEditAction` (the unchanged pure primitive)
 *  on each, aborting if either is a cancel, and only then writes both
 *  secrets. The confirm-on-empty guard is applied per secret via the same
 *  `decideEditAction` + `ui.confirm` logic `handleEdit` uses. */
export async function handleAtlassianPatEdit(
  ui: Pick<ExtensionUIContext, "notify" | "editor" | "confirm">,
  keyringFactory: () => Promise<Keyring>,
  tokenKey: SecretKey,
  label: string,
  emailPlaceholder: string,
  tokenPlaceholder: string
): Promise<void> {
  const EMAIL_KEY: SecretKey = { service: "atlassian", name: "email" };
  const EMAIL_LABEL = "Atlassian email";

  const keyring = await keyringFactory();
  const currentEmail = await keyring.getSecret(EMAIL_KEY);
  const currentToken = await keyring.getSecret(tokenKey);

  // Step 1: prompt for the email (prefill current value or placeholder).
  const emailEdited = await ui.editor(EMAIL_LABEL, currentEmail ?? emailPlaceholder);
  const emailDecision = decideEditAction(currentEmail, emailEdited);
  if (emailDecision.action === "cancel") {
    ui.notify("no change", "info");
    return;
  }

  // Step 2: prompt for the token (prefill current value or placeholder).
  const tokenEdited = await ui.editor(label, currentToken ?? tokenPlaceholder);
  const tokenDecision = decideEditAction(currentToken, tokenEdited);
  if (tokenDecision.action === "cancel") {
    ui.notify("no change", "info");
    return;
  }

  // Both prompts are non-cancel: resolve the confirm-empty guard for each,
  // then write both secrets atomically (no half-provisioned PAT).
  const emailValue = await resolveEmptyGuard(ui, emailDecision, EMAIL_LABEL, "email", currentEmail);
  if (emailValue === null) {
    ui.notify("no change", "info");
    return;
  }

  const tokenValue = await resolveEmptyGuard(ui, tokenDecision, label, "token", currentToken);
  if (tokenValue === null) {
    ui.notify("no change", "info");
    return;
  }

  // Write both secrets atomically (no partial write: no email without a
  // token, no token without an email).
  await keyring.setSecret(EMAIL_KEY, emailValue);
  await keyring.setSecret(tokenKey, tokenValue);
  ui.notify("saved", "info");
}

/** Resolve the confirm-on-empty guard for a single secret decision.
 *
 *  Returns the value to save, or null if the user declined the empty-value
 *  confirmation (abort). For non-empty decisions the value is returned
 *  directly. This mirrors the confirm-on-empty logic in `handleEdit` so the
 *  combined flow gets the same per-secret guard. */
async function resolveEmptyGuard(
  ui: Pick<ExtensionUIContext, "confirm">,
  decision: EditDecision,
  label: string,
  kind: string,
  current: string | null
): Promise<string | null> {
  if (decision.action === "cancel") {
    return null;
  }
  if (decision.action === "unchanged") {
    // Unchanged: re-write the current value (idempotent) so the atomic
    // write covers both secrets.
    return current ?? "";
  }
  if (decision.action === "confirm-empty") {
    const confirmed = await ui.confirm(
      `Save empty ${label}?`,
      `An empty ${kind} won't authenticate. Save anyway?`
    );
    return confirmed ? "" : null;
  }
  return decision.value;
}

/** Chooser → edit orchestrator for `/aura secrets edit`.
 *
 *  Shows a `ctx.ui.select` chooser listing the editable secrets. Aura PAT
 *  routes through the existing `handleEdit` (unchanged). The two Atlassian
 *  token labels route through `handleAtlassianPatEdit` (the combined
 *  email+token flow). Cancel (select returns undefined) exits with "no
 *  change" and no keyring write. */
export async function handleSecretEdit(
  ui: Pick<ExtensionUIContext, "notify" | "editor" | "confirm" | "select">,
  keyringFactory: () => Promise<Keyring>
): Promise<void> {
  const choice = await ui.select("Edit which secret?", [...SECRET_LABELS]);
  const key = pickSecretKey(choice);
  if (key === null) {
    ui.notify("no change", "info");
    return;
  }

  const label = choice!;

  // Aura PAT is a single-secret edit — route through the unchanged handleEdit.
  if (label === "Aura PAT") {
    const keyring = await keyringFactory();
    const current = await keyring.getSecret(key);
    const placeholder = SECRET_PLACEHOLDERS[label];
    await handleEdit(ui, () => Promise.resolve(keyring), current, key, label, placeholder);
    return;
  }

  // The two Atlassian token labels route through the combined email+token flow.
  const tokenPlaceholder = SECRET_PLACEHOLDERS[label];
  const emailPlaceholder = SECRET_PLACEHOLDERS["Atlassian email"];
  await handleAtlassianPatEdit(ui, keyringFactory, key, label, emailPlaceholder, tokenPlaceholder);
}

/** Thin UI wrapper around `discoverPat`.
 *
 *  Notifies the user which sources were checked, offers to import a found PAT
 *  into the keyring, and guards for cancel/non-TUI mode. */
export async function handleDiscover(
  ui: Pick<ExtensionUIContext, "notify" | "select" | "confirm">,
  keyringFactory: () => Promise<Keyring>,
  sources: DiscoverySource[] = DISCOVERY_SOURCES
): Promise<void> {
  const found = await discoverPat(sources);

  const checked = sources.map((s) => s.name).join(", ");
  const foundNames = found.map((f) => f.name).join(", ") || "none";
  ui.notify(`Discovery sources checked: ${checked}. Found in: ${foundNames}.`, "info");

  if (found.length === 0) {
    ui.notify("no PAT found in any source", "warning");
    return;
  }

  const keyring = await keyringFactory();

  if (found.length === 1) {
    const confirmed = await ui.confirm("Import Aura PAT", `Import from ${found[0].name}?`);
    if (!confirmed) {
      ui.notify("not stored", "info");
      return;
    }
    await keyring.setSecret(AURA_PAT_KEY, found[0].value);
    ui.notify(`Aura PAT imported from ${found[0].name}`, "info");
    return;
  }

  const choice = await ui.select("Import Aura PAT from:", found.map((f) => f.name));
  if (choice === undefined) {
    ui.notify("not stored", "info");
    return;
  }

  const selected = found.find((f) => f.name === choice);
  if (!selected) {
    ui.notify("not stored", "info");
    return;
  }

  await keyring.setSecret(AURA_PAT_KEY, selected.value);
  ui.notify(`Aura PAT imported from ${selected.name}`, "info");
}

type AutocompleteItem = { value: string; label: string };

export function getArgumentCompletions(prefix: string): AutocompleteItem[] | null {
  const trimmed = prefix.trim();

  // Complete the first token "secrets" until it has been fully typed.
  if (!trimmed.includes("secrets")) {
    if ("secrets".startsWith(trimmed)) {
      return [{ value: "secrets", label: "secrets" }];
    }
    return null;
  }

  // Once "secrets" is present, offer subcommands.
  const afterSecrets = trimmed === "secrets" ? "" : trimmed.slice("secrets".length).trimStart();

  if (afterSecrets.length === 0) {
    return [
      { value: "discover", label: "discover" },
      { value: "edit", label: "edit" },
    ];
  }

  const subcommands = ["discover", "edit"];
  const filtered = subcommands.filter((sub) => sub.startsWith(afterSecrets));

  return filtered.length > 0 ? filtered.map((sub) => ({ value: sub, label: sub })) : null;
}

const USAGE = "Usage: /aura secrets {discover|edit}";

export default function auraSecretsExtension(pi: ExtensionAPI) {
  pi.registerCommand("aura", {
    description: "Manage Aura secrets in the system keyring",
    getArgumentCompletions,
    handler: async (args, ctx) => {
      const parsed = parseAuraArgs(args);
      switch (parsed.command) {
        case "secrets-discover": {
          // rule: dynamic-import-createKeyring — @pi-aura/shared/keyring uses
          // .js extension specifiers internally, which Node's experimental
          // strip-types loader cannot resolve. Pi's extension runtime handles
          // static imports, so we dynamic-import createKeyring here to keep
          // the unit-test entry point runnable with `node --experimental-strip-types`.
          const { createKeyring } = await import("@pi-aura/shared/keyring");
          await handleDiscover(ctx.ui, createKeyring);
          return;
        }
        case "secrets-edit": {
          const { createKeyring, KeyringLockedError } = await import("@pi-aura/shared/keyring");
          try {
            const keyring = await createKeyring();
            await handleSecretEdit(ctx.ui, () => Promise.resolve(keyring));
          } catch (error) {
            if (error instanceof KeyringLockedError) {
              ctx.ui.notify(error.message, "error");
              return;
            }
            throw error;
          }
          return;
        }
        default:
          ctx.ui.notify(USAGE, "warning");
          return;
      }
    },
  });
}
