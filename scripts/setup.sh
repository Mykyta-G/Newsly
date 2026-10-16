#!/usr/bin/env bash
# Asks for each key in the terminal and writes .env.local.
# Press Enter to keep the current value. Secret keys are hidden while you type.
set -euo pipefail
cd "$(dirname "$0")/.."
ENV=.env.local
touch "$ENV" && chmod 600 "$ENV"

current() { grep -E "^$1=" "$ENV" 2>/dev/null | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//' || true; }

save() { # save KEY VALUE
  local tmp; tmp=$(mktemp)
  grep -vE "^$1=" "$ENV" > "$tmp" || true
  printf '%s="%s"\n' "$1" "$2" >> "$tmp"
  mv "$tmp" "$ENV" && chmod 600 "$ENV"
}

ask() { # ask KEY "label" default secret?
  local key=$1 label=$2 def=$3 secret=${4:-} cur val shown
  cur=$(current "$key"); [ -z "$cur" ] && cur=$def
  if [ -n "$secret" ] && [ -n "$cur" ]; then shown="set, ends in …${cur: -4}"; else shown=${cur:-empty}; fi
  if [ -n "$secret" ]; then
    read -rsp "$label [$shown]: " val; echo
  else
    read -rp "$label [$shown]: " val
  fi
  save "$key" "${val:-$cur}"
}

echo "Newsly setup — Enter keeps the value in brackets."
ask OPENAI_API_KEY "OpenAI API key" "" secret
ask OPENAI_MODEL   "OpenAI model" "gpt-6-luna"
ask RESEND_API_KEY "Resend API key" "" secret
ask EMAIL_FROM     "From address, like: Newsly <news@yourdomain.se>" "Newsly <onboarding@resend.dev>"
ask APP_URL        "App URL" "http://localhost:3000"
# Server secrets: generated once, never asked.
[ -n "$(current ENCRYPTION_KEY)" ] || save ENCRYPTION_KEY "$(openssl rand -hex 32)"
[ -n "$(current CRON_SECRET)" ]    || save CRON_SECRET "$(openssl rand -base64 32 | tr -d '/+=')"
[ -n "$(current GITHUB_CLIENT_ID)" ] || echo "GitHub login not set up yet: run  npm run github-oauth"

echo
echo "Saved to $ENV:"
while IFS='=' read -r k v; do
  case $k in *KEY*|*TOKEN*|*SECRET*) [ ${#v} -gt 2 ] && echo "  $k = set" || echo "  $k = MISSING" ;; *) echo "  $k = $v" ;; esac
done < "$ENV"
