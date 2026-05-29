#!/usr/bin/env bash
# Quick end-to-end smoke test for the Signal Engine.
# Requires backend running at localhost:3001 with the Lagos workspace seeded.
set -euo pipefail

API=http://localhost:3001/api/v1
WS_ID="${1:-cmoo76q0j0005q9cwhx2fncz0}"  # Lagos Dental Clinics by default

echo "== Logging in =="
TOKEN=$(curl -s $API/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"password123"}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")
echo "  token acquired"

echo "== Snapshot #1 + detect (baseline, expect 0 signals) =="
curl -s -X POST "$API/gtm/workspaces/$WS_ID/detect-signals" \
  -H "Authorization: Bearer $TOKEN" | python -c "import sys,json; print(' ', json.load(sys.stdin)['message'])"
sleep 5

echo "== Simulating growth: bump reviewsCount on entities =="
# (In production this happens naturally on the next scan. Here we just
#  capture a second snapshot after the live data has moved.)
curl -s -X POST "$API/gtm/workspaces/$WS_ID/detect-signals" \
  -H "Authorization: Bearer $TOKEN" | python -c "import sys,json; print(' ', json.load(sys.stdin)['message'])"
sleep 6

echo "== Listing detected signals =="
curl -s "$API/gtm/workspaces/$WS_ID/signals" -H "Authorization: Bearer $TOKEN" \
  | python -c "
import sys,json
d=json.load(sys.stdin)
sigs=d.get('data',[])
print(f'  {len(sigs)} signals detected')
for s in sigs[:5]:
    print(f\"   - {s['type']} strength={s['strength']} :: {s.get('description','')[:70]}\")
"

echo "== Generating signal-driven outreach for first entity =="
EID=$(curl -s "$API/gtm/workspaces/$WS_ID/entities?limit=1" -H "Authorization: Bearer $TOKEN" \
  | python -c "import sys,json; d=json.load(sys.stdin)['data']; print(d[0]['id'] if d else '')")
if [ -n "$EID" ]; then
  curl -s -X POST "$API/gtm/workspaces/$WS_ID/entities/$EID/outreach" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d '{"channel":"email","senderOffer":"patient booking + review-response automation"}' \
    | python -c "
import sys,json
d=json.load(sys.stdin)['data']
print('  Subject:', d.get('subject'))
print('  Body:', d.get('body','')[:200])
print('  Provider:', d.get('provider'), '| signals used:', d.get('signalCount'))
"
fi

echo "== Done =="
