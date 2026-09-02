#!/usr/bin/env bash
#
# Post-install smoke test for a packaged Eagle build.
#
#   usage: smoke-test.sh [launch-command]
#
# Defaults to `eagle`. For an AppImage pass the path to it; for Flatpak pass
# "flatpak run cool.eagle.Eagle".
#
# Checks the installed layout, launches the app headlessly (Xvfb if present),
# and greps the log for the specific failures this port has hit before:
#
#   * npx Electron bootstrap failing on npm >= 12 / Node >= 26
#   * libGL.so.1 not resolvable
#   * GL initialising without a driver on the library path
#   * Electron unable to fork its zygote (over-aggressive patchelf)
#   * remainingFilenameLength() returning NaN, which renames everything to "_"
#
set -uo pipefail

LAUNCH="${1:-eagle}"
LOG="$(mktemp /tmp/eagle-smoke-XXXX.log)"
pass=0; fail=0; warn=0

ok()   { echo "  [ OK ]  $1"; pass=$((pass+1)); }
bad()  { echo "  [FAIL]  $1"; fail=$((fail+1)); }
note() { echo "  [WARN]  $1"; warn=$((warn+1)); }

echo "=== installed layout ==="
SHARE=""
for d in /usr/share/eagle /app/share/eagle; do
    [ -d "$d" ] && SHARE="$d" && break
done

if [ -n "$SHARE" ]; then
    ok "found $SHARE"
    [ -f "$SHARE/patch.js" ] && ok "patch.js present" || bad "patch.js MISSING"
    n=$(ls "$SHARE"/patches/*.js 2>/dev/null | wc -l)
    [ "$n" -ge 12 ] && ok "patches/ has $n modules" || bad "patches/ has only $n modules"
    if [ -x "$SHARE/electron/electron" ] || [ -x /app/electron/electron ]; then
        ok "Electron bundled with the package"
    else
        note "no bundled Electron - will fall back to npx, which fails on npm >= 12"
    fi
    # the XDG screenshot patch must have survived packaging
    sc="$SHARE/app/app/js/lib/api/screen-capture.js"
    if [ -f "$sc" ] && grep -q "portal" "$sc" 2>/dev/null; then
        ok "XDG screen-capture patch present"
    else
        bad "screen-capture.js is missing the XDG portal patch (app_patches not applied)"
    fi
    # upstream only assigns maxPathLength for win32/darwin, so on Linux the
    # function returns NaN and name.substr(0, NaN) empties every filename
    rfl="$SHARE/app/app/js/utils/remainingFilenameLength.js"
    if [ -f "$rfl" ] && ! grep -qE '^[[:space:]]*let maxPathLength;[[:space:]]*$' "$rfl"; then
        ok "filename-length patch present (item names survive import/rename)"
    else
        bad "remainingFilenameLength.js unpatched - every item will be named _"
    fi
    if [ -f "$SHARE/../metainfo/cool.eagle.Eagle.metainfo.xml" ] \
       || [ -f /usr/share/metainfo/cool.eagle.Eagle.metainfo.xml ] \
       || [ -f /app/share/metainfo/cool.eagle.Eagle.metainfo.xml ]; then
        ok "AppStream metainfo installed (software centre will show details)"
    else
        note "no AppStream metainfo - predates v4.0.3, Discover will show a bare entry"
    fi
else
    note "no /usr/share/eagle or /app/share/eagle (AppImage runs self-contained)"
fi

echo
echo "=== launch ==="
RUN=(timeout 60 $LAUNCH)
if command -v xvfb-run >/dev/null 2>&1 && [ -z "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
    RUN=(xvfb-run -a --server-args="-screen 0 1400x900x24" timeout 60 $LAUNCH)
    echo "  (headless via Xvfb)"
fi
"${RUN[@]}" >"$LOG" 2>&1
rc=$?
echo "  exit code: $rc  (124 = still running at timeout, which is success here)"

echo
echo "=== log analysis ==="
grep -q "PATCHES MASTER"            "$LOG" && ok "compatibility layer initialised" || bad "compatibility layer never initialised"
grep -q "Eagle start"               "$LOG" && ok "Eagle main process started"      || bad "Eagle main process did not start"
grep -q "index.html"                "$LOG" && ok "main window loaded"              || note "main window not seen in 60s"

grep -qi "Electron failed to install correctly" "$LOG" && bad "npx Electron bootstrap failed" || ok "no Electron bootstrap failure"
grep -qi "Could not dlopen libGL"   "$LOG" && bad "libGL.so.1 not resolvable"      || ok "libGL resolved"
grep -qi "InitializeGLNoExtensions" "$LOG" && bad "GL init failed (driver not on library path)" || ok "GL initialised"
grep -qi "Zygote could not fork"    "$LOG" && bad "zygote fork failed (Electron binary damaged)" || ok "zygote forked"
grep -qi "dumped core\|trace trap"  "$LOG" && bad "process dumped core"            || ok "no core dump"

echo
echo "  passed: $pass   failed: $fail   warnings: $warn"
echo "  full log: $LOG"
[ "$fail" -eq 0 ] && echo "  RESULT: PASS" || echo "  RESULT: FAIL"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
