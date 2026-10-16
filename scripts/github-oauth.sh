#!/usr/bin/env bash
# One-time: register Newsly as a GitHub OAuth App, then paste its Client ID + secret here.
# Saves them to .env.local and to Vercel (production + preview).
set -euo pipefail
cd "$(dirname "$0")/.."
APP_URL=${1:-https://newsly-neon.vercel.app}
CB="$APP_URL/api/auth/callback"
enc() { python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$1"; }
URL="https://github.com/settings/applications/new?oauth_application%5Bname%5D=Newsly&oauth_application%5Burl%5D=$(enc "$APP_URL")&oauth_application%5Bcallback_url%5D=$(enc "$CB")"

cat <<MSG
Opening GitHub → New OAuth App. Check the form says:
  Application name:           Newsly
  Homepage URL:               $APP_URL
  Authorization callback URL: $CB
Click "Register application", then "Generate a new client secret".
MSG
open "$URL" 2>/dev/null || echo "Open: $URL"
echo
read -rp  "Client ID: " ID
read -rsp "Client secret (hidden): " SECRET; echo
[ -n "$ID" ] && [ -n "$SECRET" ] || { echo "Both are needed."; exit 1; }

touch .env.local && chmod 600 .env.local
for kv in "GITHUB_CLIENT_ID=$ID" "GITHUB_CLIENT_SECRET=$SECRET"; do
  k=${kv%%=*}; v=${kv#*=}
  grep -v "^$k=" .env.local > .env.tmp || true; printf '%s="%s"\n' "$k" "$v" >> .env.tmp; mv .env.tmp .env.local
  for e in production preview; do printf '%s' "$v" | vercel env add "$k" "$e" --force >/dev/null 2>&1 && echo "  $k → Vercel $e ok" || echo "  $k → Vercel $e FAILED"; done
done
chmod 600 .env.local
echo "Saved. Tell Gunnar it's done (he redeploys)."
