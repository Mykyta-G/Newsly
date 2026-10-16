#!/usr/bin/env bash
# One-time: send Newsly email from your own domain via Resend.
#   npm run resend-domain -- yourdomain.se [news]
# 1) registers the domain in Resend  2) prints the DNS records to add at your DNS host
# 3) waits until Resend has verified them  4) sets EMAIL_FROM locally and on Vercel.
set -euo pipefail
cd "$(dirname "$0")/.."
DOMAIN=${1:-}; LOCAL=${2:-news}
[ -n "$DOMAIN" ] || read -rp "Domain to send from (e.g. simpleschedules.se): " DOMAIN
echo "Newsly's sending key can only send, so registering a domain needs a full-access key."
echo "Create one at https://resend.com/api-keys (Permission: Full access), paste it here. It is not saved."
read -rsp "Full-access Resend key (hidden): " KEY; echo
api() { curl -s -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" "$@"; }

ID=$(api https://api.resend.com/domains | python3 -c 'import json,sys;d=json.load(sys.stdin);print(next((x["id"] for x in d.get("data",[]) if x["name"]==sys.argv[1]),""))' "$DOMAIN")
if [ -z "$ID" ]; then
  R=$(api -X POST https://api.resend.com/domains -d "{\"name\":\"$DOMAIN\",\"region\":\"eu-west-1\"}")
  ID=$(printf '%s' "$R" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("id",""))')
  [ -n "$ID" ] || { echo "Resend said: $R"; exit 1; }
  echo "Registered $DOMAIN in Resend."
fi

echo; echo "Add these DNS records at your domain host (where $DOMAIN's DNS lives):"
api "https://api.resend.com/domains/$ID" | python3 -c '
import json,sys
d=json.load(sys.stdin)
for r in d.get("records",[]):
    print(f"  {r[\"type\"]:5} name: {r[\"name\"]:28} value: {r[\"value\"]}" + (f"   priority: {r[\"priority\"]}" if r.get("priority") is not None else "") + f"   [{r.get(\"status\")}]")
print("  status:", d.get("status"))'
echo
read -rp "Press Enter once the records are added (DNS can take a few minutes)… " _
for i in $(seq 1 30); do
  api -X POST "https://api.resend.com/domains/$ID/verify" >/dev/null
  S=$(api "https://api.resend.com/domains/$ID" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("status",""))')
  echo "  Resend status: $S"
  [ "$S" = "verified" ] && break
  sleep 20
done
[ "$S" = "verified" ] || { echo "Not verified yet. Re-run this command later; it picks up where it left off."; exit 1; }

FROM="Newsly <$LOCAL@$DOMAIN>"
touch .env.local && chmod 600 .env.local
grep -v "^EMAIL_FROM=" .env.local > .env.tmp || true; printf 'EMAIL_FROM="%s"\n' "$FROM" >> .env.tmp; mv .env.tmp .env.local; chmod 600 .env.local
for e in production preview; do printf '%s' "$FROM" | vercel env add EMAIL_FROM "$e" --force >/dev/null 2>&1 && echo "  EMAIL_FROM → Vercel $e ok"; done
echo "Done: Newsly now sends as $FROM. Tell Gunnar so he redeploys (or run: vercel deploy --prod)."
