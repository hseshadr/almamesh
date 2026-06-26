#!/usr/bin/env bash
#
# go-live-almamesh.sh — one command to activate almamesh.com auto-deploy.
#
# Automates everything mechanical (Pages project, base64 keys, 4 GitHub secrets,
# first deploy) and pauses ONLY for the two things that need you:
#   1. `wrangler login` (opens your browser)
#   2. pasting a Cloudflare API token (created in the dashboard)
#
# Safe to re-run: every step checks state first and asks before doing anything
# outward-facing. Nothing is deployed until the secrets exist.
#
# Usage (from the repo root):   ./scripts/go-live-almamesh.sh
# Full background: docs/deploy/GO-LIVE-almamesh-com.md
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PROJECT="almamesh"
DOMAIN="almamesh.com"
KEY_DIR="backend/keys-prod"
PRIV="$KEY_DIR/private.key"
PUB="$KEY_DIR/public.key"
WRANGLER="npx --yes wrangler@latest"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
confirm() { read -rp "$1 [y/N] " r; [[ "$r" =~ ^[Yy]$ ]]; }
pause() { read -rp "$1 — press Enter when done… " _; }

bold "AlmaMesh go-live → ${DOMAIN} (Cloudflare Pages)"
echo "Repo: $REPO_ROOT"
echo

# ── 0. Prerequisites ─────────────────────────────────────────────────────────
bold "0. Checking prerequisites"
command -v gh >/dev/null   || die "GitHub CLI 'gh' not found. Install it, then 'gh auth login'."
gh auth status >/dev/null 2>&1 || die "'gh' is not authenticated. Run: gh auth login"
command -v npx >/dev/null  || die "'npx' (Node) not found. Install Node 20+."
command -v base64 >/dev/null || die "'base64' not found."
[[ -f "$PRIV" && -f "$PUB" ]] || die "Signing keys missing at $KEY_DIR/. They must already exist (do NOT regenerate — that rotates the pin)."
[[ "$(wc -c < "$PRIV" | tr -d ' ')" == "32" ]] || die "$PRIV is not 32 bytes — wrong/corrupt key."
ok "gh authenticated, npx present, 32-byte signing keypair found"
echo

# ── 1. Back up the private key (irreplaceable) ───────────────────────────────
bold "1. Back up the production signing key (IRREPLACEABLE)"
warn "$PRIV is the ONE ed25519 key every installed client pins. Lose it and you"
warn "cannot ship a trusted bundle update — all clients would have to re-onboard."
echo "Its base64 (store this in your password manager as BUNDLE_PRIVATE_KEY_B64):"
echo
base64 < "$PRIV"
echo
confirm "Have you saved this key to durable, off-machine storage?" \
  || die "Back up the key first, then re-run. (This is the one thing you can't undo.)"
ok "Key backup confirmed"
echo

# ── 2. wrangler login ────────────────────────────────────────────────────────
bold "2. Cloudflare login (opens your browser)"
if $WRANGLER whoami >/dev/null 2>&1; then
  ok "Already logged in to Cloudflare"
else
  confirm "Run 'wrangler login' now?" || die "Cloudflare login required."
  $WRANGLER login
fi
echo "Your Cloudflare account(s):"
$WRANGLER whoami || true
echo
read -rp "Paste your Cloudflare ACCOUNT ID (from the table above): " CF_ACCOUNT_ID
[[ -n "$CF_ACCOUNT_ID" ]] || die "Account ID is required."
echo

# ── 3. Create the Pages project (idempotent) ─────────────────────────────────
bold "3. Cloudflare Pages project '$PROJECT' (production branch: main)"
if $WRANGLER pages project list 2>/dev/null | grep -qw "$PROJECT"; then
  ok "Project '$PROJECT' already exists"
else
  confirm "Create Pages project '$PROJECT'?" || die "Project required."
  $WRANGLER pages project create "$PROJECT" --production-branch=main
  ok "Project created"
fi
echo

# ── 4. Cloudflare API token (for CI deploys) ─────────────────────────────────
bold "4. Cloudflare API token (one-time, for CI auto-deploy)"
echo "Open: https://dash.cloudflare.com/profile/api-tokens"
echo "Then follow EXACTLY:"
echo "  1) Click 'Create Token'  →  bottom: 'Create Custom Token'  →  'Get started'"
echo "  2) Token name:  almamesh-deploy   (any label — just for you)"
echo "  3) Permissions (three dropdowns, left → right):"
echo "        Account   ·   Cloudflare Pages   ·   Edit"
echo "  4) Account Resources:  Include  ·  <your account>"
echo "  5) Leave Client IP / TTL blank  →  'Continue to summary'  →  'Create Token'"
echo "  6) Copy the long token string (shown only once)"
pause "Done the 6 steps above and copied the token"
read -rsp "Paste the Cloudflare API token here (hidden as you type): " CF_API_TOKEN; echo
[[ -n "$CF_API_TOKEN" ]] || die "API token is required."
echo

# ── 5. Set the 4 GitHub repo secrets ─────────────────────────────────────────
bold "5. Setting GitHub repo secrets"
confirm "Set CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, BUNDLE_PRIVATE_KEY_B64, BUNDLE_PUBLIC_KEY_B64?" \
  || die "Secrets are required for auto-deploy."
gh secret set CLOUDFLARE_API_TOKEN   --body "$CF_API_TOKEN"
gh secret set CLOUDFLARE_ACCOUNT_ID  --body "$CF_ACCOUNT_ID"
gh secret set BUNDLE_PRIVATE_KEY_B64 --body "$(base64 < "$PRIV")"
gh secret set BUNDLE_PUBLIC_KEY_B64  --body "$(base64 < "$PUB")"
ok "All 4 secrets set"
gh secret list | grep -E "CLOUDFLARE_|BUNDLE_" || true
echo

# ── 6. Custom domain ─────────────────────────────────────────────────────────
bold "6. Attach the custom domain $DOMAIN"
echo "There is no wrangler command for this — attach it in the dashboard:"
echo "  Workers & Pages → $PROJECT → Custom domains → Set up a custom domain → $DOMAIN"
echo "(Cloudflare auto-provisions DNS + TLS. The zone must be on your account.)"
pause "Attach $DOMAIN (and optionally www) in the dashboard"
echo

# ── 7. First deploy ──────────────────────────────────────────────────────────
bold "7. First deploy"
echo "deploy.yml now auto-deploys on every green push to main. Trigger one now too?"
if confirm "Run the deploy workflow now and watch it?"; then
  gh workflow run "Deploy almamesh.com"
  sleep 5
  RUN_ID="$(gh run list --workflow='Deploy almamesh.com' --limit 1 --json databaseId -q '.[0].databaseId')"
  [[ -n "$RUN_ID" ]] && gh run watch "$RUN_ID" || warn "Could not find the run; check: gh run list --workflow='Deploy almamesh.com'"
else
  warn "Skipped. The next green push to main will auto-deploy."
fi
echo

bold "Done."
ok  "almamesh.com auto-deploy is ACTIVE — merges to main now ship automatically."
echo "Verify live: open https://$DOMAIN — onboard, generate a chart offline, check a clean console."
echo "Rollback: Cloudflare dashboard → $PROJECT → Deployments → Rollback."
