#!/bin/bash
# Every browser check, against an expected assertion count.
#
# The count is the point. A check that times out prints nothing and looks
# exactly like a clean run to anything that greps for failures. If the number
# of PASSes is not the number this table expects, the run is wrong even when
# nothing said FAIL.
#
# Needs the dev server: npx vite --port 5199 --host 127.0.0.1 --strictPort
# Runtime paths (playwright-core, chromium) can be overridden with PW_CORE and
# PW_CHROMIUM; screenshots land in .artifacts/ (or CHECK_OUT).
cd "$(dirname "$0")" || exit 1
if ! curl -s -o /dev/null --noproxy 127.0.0.1 http://127.0.0.1:5199/; then
  echo "no dev server on 127.0.0.1:5199 - start it first"; exit 1
fi
declare -A EXP=( [authboot]=14 [offline]=9 [offlineui]=12 [smoke]=8 [importreview]=12 [allyears]=13 [toast]=4 [catorder]=11 [subsort]=6 [drilldim]=5 [bulkselect]=26 [trips]=99 [edit]=31 [setuptip]=33 [prompt]=5 [backdate]=13 [triprow]=46 [tripfilter]=18 [demotrip]=12 [touchhover]=7 [aiimport]=73 [recap]=14 )
total=0; bad=0
for name in "${!EXP[@]}"; do
  out=$(timeout 300 node "check-$name.mjs" 2>&1)
  pass=$(echo "$out" | grep -c '^PASS')
  fail=$(echo "$out" | grep -c '^FAIL')
  want=${EXP[$name]}
  if [ "$pass" -eq "$want" ] && [ "$fail" -eq 0 ]; then
    printf '%-12s OK   %2d/%d\n' "$name" "$pass" "$want"
  else
    printf '%-12s BAD  %2d/%d  (%d failed)\n' "$name" "$pass" "$want" "$fail"
    echo "$out" | grep '^FAIL' | sed 's/^/               /'
    bad=$((bad+1))
  fi
  total=$((total+pass))
done
echo "---"
echo "$total assertions, $bad suite(s) off expectation"
exit $((bad > 0))
