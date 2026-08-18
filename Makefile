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
SKILL_DIST  := skills/aura-digest/dist
ENTRY_OUT   := $(SKILL_DIST)/aura.mjs

.PHONY: all install typecheck build clean watch

all: install build

install:
	cd $(SCRIPTS_DIR) && npm install

typecheck:
	cd $(SCRIPTS_DIR) && npm run typecheck

build: typecheck
	cd $(SCRIPTS_DIR) && npm run build
	@echo "verifying $(ENTRY_OUT) exists…"
	@test -f $(ENTRY_OUT) || { echo "ERROR: $(ENTRY_OUT) was not produced"; exit 1; }
	@echo "built $(ENTRY_OUT)"

watch:
	cd $(SCRIPTS_DIR) && npm run build -- --watch

clean:
	rm -rf $(SCRIPTS_DIR)/node_modules $(SCRIPTS_DIR)/package-lock.json
	rm -rf $(SKILL_DIST)
