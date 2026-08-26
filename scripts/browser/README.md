# Browser checks

End-to-end checks driven through a real Chromium, against the dev server.

These live in the repo because they once did not: fifty-one suites (~600
assertions) accumulated in a session scratchpad, the remote container was
recycled, and all of them vanished unrecoverably. What is here is what has
been (re)written since - new checks belong HERE, not in a scratchpad.

Run: `bash scripts/browser/run.sh` with the dev server up on 127.0.0.1:5199.
The runner compares PASS counts against an expected table - a timed-out check
prints nothing and would otherwise look clean. Playwright paths default to the
Claude Code remote container's; override with PW_CORE / PW_CHROMIUM.

Conventions worth keeping: every request to the Supabase project is
intercepted (nothing may reach production); assertions state the invariant,
not the implementation; seeds are guarded with a localStorage flag because
addInitScript re-runs on every navigation.
