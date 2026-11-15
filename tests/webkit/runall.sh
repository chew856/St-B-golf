#!/bin/zsh
# Runs every suite one at a time against the local source site and prints one line each.
cd "$(dirname "$0")"
B=http://localhost:8001/site/
for t in xsmoke xundocore xundo xphone xmovetabs xa-shop xa-hosp xa-cartgc xb-lessons xb-events xb-course xb-teesheet xb-holds xc-fn xc-bill xd-undo xe-nosave xe-checkout xg-promo xg-promo2 xrp2-test xrgo-test xrg-staff xrh-test xsidebar xi18n-portal xts-drill xts-scroll xls-pay xls-grid xmigrate xcrosstab xperf-routes xperf-portaltee xmob-touch xadvice-test xps-overflow xgs-sell xps-tender xshop-pickup xpc-item xpo-test xc-fw xdn-dining xpick-search; do
  out=$(node $t.mjs $B 2>&1)
  fails=$(echo "$out" | grep -E '^FAIL|FAILED|crashed|Error:' | head -4 | tr '\n' ' ' | cut -c1-400)
  summary=$(echo "$out" | grep -E 'ALL PASSED|passed|load clean|routes clean|PASS [0-9]+ FAIL|booking OK' | tail -1 | cut -c1-120)
  echo "== $t: ${summary:-?} ${fails}"
done
