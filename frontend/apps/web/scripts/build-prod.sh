#!/usr/bin/env bash
#
# build-prod.sh — produce the PRODUCTION deploy artifact for https://almamesh.com
# (Cloudflare Pages serves frontend/apps/web/dist as-is; there is no server).
#
# What it does, in order:
#   1. Rebuilds the almamesh wheel from the current checkout.
#   2. Signs the offline bundle with the PRODUCTION keypair (backend/keys-prod,
#      gitignored — custody rules in docs/deploy/almamesh-com.md) into
#      backend/origin-prod, labeled with the latest git tag by default.
#   3. Swaps the production bundle + production public.key into apps/web/public/
#      (replacing whatever dev-signed bundle setup-dev-assets.sh put there;
#      re-run setup-dev-assets.sh / `uv run poe demo-fresh` to get dev back).
#   4. Runs the REAL production build: NO exit-gate hooks
#      (VITE_EXIT_GATE_HOOKS empty) and VITE_API_URL empty (no backend exists).
#
# Prereqs (fail-closed below):
#   - bun install done; setup-dev-assets.sh run once (public/pyodide + public/models)
#   - backend/keys-prod/private.key exists:
#       cd backend && uv run almamesh-bundle keygen ./keys-prod
#     (deliberately NOT auto-generated here: generating a fresh key would
#      silently rotate the pin and orphan every installed client)
#
# Usage:  bash apps/web/scripts/build-prod.sh
#         BUNDLE_VERSION=v9.9.9 bash apps/web/scripts/build-prod.sh   # override label
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"             # frontend/apps/web
REPO_ROOT="$(cd "${WEB_DIR}/../../.." && pwd)"        # repo root (almamesh/)
BACKEND_DIR="${REPO_ROOT}/backend"
PUBLIC_DIR="${WEB_DIR}/public"
KEYS_DIR="${BACKEND_DIR}/keys-prod"
ORIGIN_DIR="${BACKEND_DIR}/origin-prod"

# --- Fail-closed preflight ----------------------------------------------------
if [[ ! -f "${KEYS_DIR}/private.key" || ! -f "${KEYS_DIR}/public.key" ]]; then
  echo "!! Production keypair missing at ${KEYS_DIR}/" >&2
  echo "!! Generate ONCE and back it up (docs/deploy/almamesh-com.md):" >&2
  echo "!!   cd backend && uv run almamesh-bundle keygen ./keys-prod" >&2
  exit 1
fi
if [[ ! -f "${PUBLIC_DIR}/pyodide/pyodide.asm.wasm" ]]; then
  echo "!! Pyodide dist missing — run apps/web/scripts/setup-dev-assets.sh once first." >&2
  exit 1
fi
if [[ ! -d "${PUBLIC_DIR}/models" ]]; then
  echo "!! public/models missing — run apps/web/scripts/setup-dev-assets.sh once first." >&2
  exit 1
fi

BUNDLE_VERSION="${BUNDLE_VERSION:-$(git -C "${REPO_ROOT}" describe --tags --abbrev=0 2>/dev/null || echo "0.0.0+$(git -C "${REPO_ROOT}" rev-parse --short HEAD)")}"
echo "==> Production build for almamesh.com — bundle version ${BUNDLE_VERSION}"

# --- 1. Fresh wheel from this checkout -----------------------------------------
echo "==> Building almamesh wheel"
( cd "${BACKEND_DIR}" && uv build --wheel )
WHEEL="$(ls -t "${BACKEND_DIR}"/dist/almamesh-*-py3-none-any.whl | head -1)"
echo "    wheel: ${WHEEL}"

# --- 2. Sign the offline bundle with the PRODUCTION key ------------------------
# A clean origin dir so the artifact contains exactly one signed bundle.
rm -rf "${ORIGIN_DIR}"
echo "==> Signing the production bundle into ${ORIGIN_DIR}"
( cd "${BACKEND_DIR}" && uv run almamesh-bundle bundle ./origin-prod ./keys-prod/private.key \
    --version "${BUNDLE_VERSION}" --offline --almamesh-wheel "${WHEEL}" )

# --- 3. Swap the production bundle + pinned public key into public/ ------------
echo "==> Publishing production bundle + public.key into ${PUBLIC_DIR}"
rm -rf "${PUBLIC_DIR}/bundle"
mkdir -p "${PUBLIC_DIR}/bundle"
cp -R "${ORIGIN_DIR}/." "${PUBLIC_DIR}/bundle/"
cp "${KEYS_DIR}/public.key" "${PUBLIC_DIR}/public.key"

# --- 4. The real production build (no hooks, no backend URL) -------------------
echo "==> Building the app (tsc -b && vite build) — hooks OFF, VITE_API_URL empty"
( cd "${WEB_DIR}" && VITE_API_URL= VITE_EXIT_GATE_HOOKS= bun run build )

# --- Artifact sanity ------------------------------------------------------------
DIST="${WEB_DIR}/dist"
for must in index.html sw.js manifest.webmanifest _headers _redirects public.key \
            bundle/latest pyodide/pyodide.asm.wasm; do
  if [[ ! -f "${DIST}/${must}" ]]; then
    echo "!! dist is missing ${must}" >&2
    exit 1
  fi
done
# The deployed bundle must verify against the PRODUCTION key, not the dev key.
if ! cmp -s "${DIST}/public.key" "${KEYS_DIR}/public.key"; then
  echo "!! dist/public.key is not the production key" >&2
  exit 1
fi
echo "==> Done. Deploy artifact: ${DIST} ($(du -sh "${DIST}" | cut -f1), $(find "${DIST}" -type f | wc -l | tr -d ' ') files)"
echo "==> Largest files (Cloudflare Pages cap is 25 MiB/file):"
find "${DIST}" -type f -size +8M -exec ls -lh {} \; | awk '{print "    " $5 "  " $9}'
