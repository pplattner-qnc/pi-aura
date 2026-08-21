# Makefile — build the pi-aura scripts and copy compiled output into place.
#
# The TypeScript sources + build tooling live in scripts/ (with their own
# package.json/node_modules, gitignored). esbuild bundles each entry point
# and writes the .mjs directly into the consuming skill's dist/, which is
# committed so end users of the pi package don't need to build anything.
#
# Usage:
#   make            install build deps, typecheck, build, and verify outputs
#   make build      typecheck + bundle (assumes deps are installed)
#   make install    install build deps into scripts/node_modules
#   make typecheck  tsc --noEmit (assumes deps are installed)
#   make clean      remove scripts/node_modules + all built dist/ dirs
#   make watch      rebuild on source change (assumes deps are installed)

SCRIPTS_DIR := scripts
SHARED_DIR   := packages/shared
DIGEST_DIST := skills/core/aura-digest/dist
AURA_DIST    := skills/core/aura/dist
SYNC_DIST    := .pi/skills/engineering-sync/dist
OPENAPI_DIR  := $(SHARED_DIR)/openapi
GEN_DIR      := $(SHARED_DIR)/src/generated
ENTRY_OUTS   := $(DIGEST_DIST)/aura-digest.mjs $(AURA_DIST)/aura.mjs $(SYNC_DIST)/engineering-sync.mjs

.PHONY: all install typecheck build clean watch codegen

all: install build

install:
	npm install

# Regenerate the typed Aura REST client from openapi/openapi.yaml into
# src/generated/ (gitignored — rebuild after changing the spec).
codegen:
	cd $(SHARED_DIR) && npm run codegen

# Regenerate the client, then typecheck + bundle. Use this after touching the spec.
gen: codegen typecheck build

typecheck:
	cd $(SCRIPTS_DIR) && npm run typecheck

build: typecheck
	cd $(SCRIPTS_DIR) && npm run build
	@for f in $(ENTRY_OUTS); do \
	  echo "verifying $$f exists…"; \
	  test -f $$f || { echo "ERROR: $$f was not produced"; exit 1; }; \
	done
	@echo "built $(ENTRY_OUTS)"

watch:
	cd $(SCRIPTS_DIR) && npm run build -- --watch

clean:
	rm -rf $(SCRIPTS_DIR)/node_modules $(SCRIPTS_DIR)/package-lock.json
	rm -rf $(GEN_DIR) $(DIGEST_DIST) $(AURA_DIST) $(SYNC_DIST)
