#!/usr/bin/env bash
# openapi-sync.sh — keep packages/shared/openapi/openapi.yaml fresh from the
# Aura source repo.
#
# The OpenAPI spec that drives the generated Aura REST client
# (packages/shared/src/generated/, via packages/shared/openapi-ts.config.ts)
# must match the spec the Aura API actually serves. This script pulls the
# canonical spec straight from the Aura repo, compares it to the local codegen
# source, and copies it over only when it changed.
#
# Steps:
#   1. Clone git@bitbucket.org:anwaltde/aura.git into a throwaway
#      /tmp/aura-<random-suffix> directory (shallow, depth 1 — we only need one
#      file, so we skip history). A unique suffix avoids collisions with
#      concurrent runs.
#   2. Compare the hash of the freshly cloned
#      <clone>/src/api/openapi/openapi.yaml against the local
#      packages/shared/openapi/openapi.yaml.
#   3. If they differ, copy the new version over the local one and print what
#      changed (old → new hash). If they match, do nothing and say so.
#   4. Always delete the throwaway clone (even on error), via `trap`.
#
# Exit codes:
#   0 — spec is now in sync (copied or already identical)
#   1 — a step failed (clone, missing source file, copy). The temp clone is
#       still cleaned up.
#
# Run from the repo root (the `openapi-sync` Taskfile target does this), or set
# REPO_ROOT. Idempotent: running twice in a row is a no-op the second time.
#
# NOTE: this only updates the spec consumed by the codegen flow (the
# `openapi-sync` → `codegen` Taskfile targets). It does NOT regenerate the
# typed client — run `task codegen` afterward to rebuild
# packages/shared/src/generated/ from the refreshed spec.

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

AURA_GIT_URL="git@bitbucket.org:anwaltde/aura.git"
# The path to the spec inside the Aura repo.
AURA_SPEC_PATH="src/api/openapi/openapi.yaml"
# The local codegen source (what openapi-ts.config.ts reads).
LOCAL_SPEC_PATH="packages/shared/openapi/openapi.yaml"

# Resolve the repo root: REPO_ROOT env var, or the location of this script's
# parent's parent (the script lives in scripts/ or scripts/openapi-sync.sh,
# and the repo root is one level above scripts/).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${REPO_ROOT:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
LOCAL_SPEC_ABS="${REPO_ROOT}/${LOCAL_SPEC_PATH}"

# A random suffix so two runs (or a concurrent run) don't clobber each other.
# mktemp gives a safe, unique directory.
TMP_BASE="$(mktemp -d -t aura-XXXXXXXXXX)"
CLONE_DIR="${TMP_BASE}/aura"

# ---------------------------------------------------------------------------
# Cleanup — always remove the temp clone, even on error or Ctrl-C
# ---------------------------------------------------------------------------

cleanup() {
  rm -rf "${TMP_BASE}"
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log() { printf '[openapi-sync] %s\n' "$*"; }

# hash a file with sha256, printing just the digest (portable: works on GNU
# coreutils and macOS shasum).
sha_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

# ---------------------------------------------------------------------------
# 1. Clone the Aura repo (shallow — we only need one file)
# ---------------------------------------------------------------------------

log "cloning ${AURA_GIT_URL} (depth 1) → ${CLONE_DIR}"
git clone --depth 1 "${AURA_GIT_URL}" "${CLONE_DIR}"

CLONED_SPEC="${CLONE_DIR}/${AURA_SPEC_PATH}"
if [ ! -f "${CLONED_SPEC}" ]; then
  log "ERROR: expected spec not found in clone: ${AURA_SPEC_PATH}"
  log "  (looked for ${CLONED_SPEC})"
  exit 1
fi

# ---------------------------------------------------------------------------
# 2. Compare hashes
# ---------------------------------------------------------------------------

CLONED_HASH="$(sha_of "${CLONED_SPEC}")"

if [ -f "${LOCAL_SPEC_ABS}" ]; then
  LOCAL_HASH="$(sha_of "${LOCAL_SPEC_ABS}")"
else
  LOCAL_HASH="(missing)"
  log "local spec not found at ${LOCAL_SPEC_ABS} — will copy the new one"
fi

log "cloned  : ${CLONED_HASH}  ${AURA_SPEC_PATH}"
log "local   : ${LOCAL_HASH}  ${LOCAL_SPEC_PATH}"

if [ "${LOCAL_HASH}" = "${CLONED_HASH}" ]; then
  log "already in sync — nothing to copy."
  exit 0
fi

# ---------------------------------------------------------------------------
# 2a. Copy the new version over the local one
# ---------------------------------------------------------------------------

log "spec differs — copying new version → ${LOCAL_SPEC_PATH}"
mkdir -p "$(dirname "${LOCAL_SPEC_ABS}")"
cp "${CLONED_SPEC}" "${LOCAL_SPEC_ABS}"

NEW_HASH="$(sha_of "${LOCAL_SPEC_ABS}")"
log "updated  : ${NEW_HASH}  ${LOCAL_SPEC_PATH}"
log "done. Run \`task codegen\` to regenerate the typed client from the refreshed spec."
