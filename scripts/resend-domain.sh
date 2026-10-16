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

echo; echo "DNS records Resend needs:"
RECORDS=$(api "https://api.resend.com/domains/$ID")
printf '%s' "$RECORDS" | python3 -c '
import json,sys
d=json.load(sys.stdin)
for r in d.get("records",[]):
    print(f"  {r[\"type\"]:5} {r[\"name\"]:28} {r[\"value\"][:60]}" + (f"  prio {r[\"priority\"]}" if r.get("priority") is not None else "") + f"  [{r.get(\"status\")}]")'

# If the apex domain's DNS is on Vercel, add the records there automatically.
APEX=$(printf '%s' "$DOMAIN" | awk -F. '{print $(NF-1)"."$NF}')
if vercel domains inspect "$APEX" 2>&1 | grep -qi "vercel-dns"; then
  echo; echo "$APEX's DNS is on Vercel, adding the records there…"
  printf '%s' "$RECORDS" | python3 -c '
import json,sys
apex=sys.argv[1]; dom=sys.argv[2]
for r in json.load(sys.stdin).get("records",[]):
    name=r["name"]
    full=name if name.endswith(apex) else (f"{name}.{dom}" if dom!=apex else name)
    sub=full[:-len(apex)-1] if full.endswith("."+apex) else ("" if full==apex else full)
    print("\t".join([sub, r["type"], r["value"], str(r.get("priority") or "")]))' "$APEX" "$DOMAIN" | while IFS=$'\t' read -r SUB TYPE VALUE PRIO; do
    if [ "$TYPE" = "MX" ]; then vercel dns add "$APEX" "$SUB" MX "$VALUE" "$PRIO" >/dev/null 2>&1; else vercel dns add "$APEX" "$SUB" "$TYPE" "$VALUE" >/dev/null 2>&1; fi \
      && echo "  added $TYPE $SUB" || echo "  $TYPE $SUB: not added (already there?)"
  done
else
  echo; read -rp "Add the records above at your DNS host, then press Enter… " _
fi
echo "Waiting for Resend to verify (DNS can take a few minutes)…"
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
