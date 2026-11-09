# Mac daily synchronization

Run `node scripts/mac-daily-job.mjs` in the dedicated checkout on the authorized Mac. The original developer checkout can contain unfinished work and must not be reset by a scheduled run.

The runner uses only the existing Wrangler OAuth login and the original account/D1 binding. No credential is copied into the repository or scheduler. Existing login refresh is permitted; a missing or rejected login stops the run instead of creating a new grant. Authorization output is checked only in memory. Wrangler disk logging is disabled for that check; only verification booleans and fixed, sanitized failure categories are retained, never its full identity output.

Each invocation freezes one UTC execution time, serializes CN and US bounded catch-up writers, and checks the existing reviewed quarterly releases. It does not initialize, rebuild, deploy, approve candidates, or restore the removed GitHub update workflow. Existing exchange-calendar logic selects the latest settled session and skips complete data. The separate manual US theme release workflow remains available.

A run-wide atomic `/tmp/trendbeak-mac-job.lock` prevents overlapping coordinator invocations. Individual scripts retain their own writer locks and optimistic database guards. A child has a 180-second bound, no automatic retry, and independent jobs retain separate results. Never delete a leftover lock without inspecting the interrupted run and database outcome. Direct manual writer commands must not overlap this runner.

Private logs and quarterly audit files are stored under `~/Library/Logs/trendbeak-sync` with private directories and files. One persistent quarterly attempt marker per UTC date prevents repeated SEC requests after a failure. A failed or interrupted attempt stays visible; do not remove its marker to force an automatic retry. `--skip-quarterly` is only for an explicit controlled verification.

A zero exit code is insufficient: each writer must emit the expected, complete JSON report for its market and operation. Empty, malformed, mismatched, or incomplete reports fail closed. The summary distinguishes job completion from source freshness. Reported source dates behind the settled session produce a nonzero result even if a writer completed. For example, a current CN close does not imply that all twelve valuation providers have published that date. No missing observation is synthesized. The summary is not a substitute for a separate bounded database and online date check.

## Scheduling acceptance

Use the official desktop scheduled-task tool from a local task. A cloud conversation connected to a Mac is not itself a local task; an attempted local heartbeat there is rejected. Do not replace that restriction with an untracked daemon.

The Mac must be powered on, online, and the desktop app running with the project accessible. Sleep, app exit, network loss, or power loss can prevent a run. Do not promise automatic wake or missed-run replay. The next successful catch-up selects the latest settled session; a gap outside existing source bounds stops for explicit repair. Do not change power, network, or security settings as part of this setup.

Creation of a schedule is not natural-run acceptance. Verify the actual local scheduler identity, cadence, next execution, first unattended result, and source dates before declaring the migration fully operational. Keep a single scheduled writer. GitHub data updates stay removed; quality, security, and manual reviewed-release workflows remain.
