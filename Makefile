# AlmaMesh — convenience wrappers around the uv/poe task runner.
#
# `make demo` is the one-command turnkey browser demo. It installs the frontend,
# fetches/signs the dev assets, builds the PWA, and serves it at
# http://localhost:4173 — entirely on-device, no backend, offline after first load.
#
# These targets just wrap `uv run poe <task>` (the single source of truth lives in
# pyproject.toml [tool.poe.tasks]) so you can type `make demo` instead.
#
# UV is the canonical invocation: `env -u VIRTUAL_ENV uv run ...`. Clearing
# VIRTUAL_ENV makes the entry point immune to a stale `VIRTUAL_ENV` left over in
# a contributor's shell (e.g. an activated venv from another checkout) — uv would
# otherwise warn `VIRTUAL_ENV=... does not match the project environment` on every
# run. We always want uv to manage the project's own `.venv`, so unsetting it is
# both correct and silent. See the UV var below.

.DEFAULT_GOAL := help
.PHONY: help demo demo-fresh build assets test

# uv, invoked with any stale VIRTUAL_ENV cleared so the project's own .venv is
# always used (no "does not match the project environment" warning).
UV := env -u VIRTUAL_ENV uv

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

demo: ## Turnkey: install -> assets -> build -> open the browser demo (http://localhost:4173)
	$(UV) run poe demo

demo-fresh: ## Like demo, but force-rebuilds the signed dev bundle first
	$(UV) run poe demo-fresh

build: ## Build the frontend production bundle
	$(UV) run poe frontend-build

assets: ## Fetch/sign the dev assets (Pyodide dist + signed edge bundle)
	$(UV) run poe dev-assets

test: ## Run the backend engine test suite
	cd backend && $(UV) run pytest -q
