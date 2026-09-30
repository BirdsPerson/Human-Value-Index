#!/bin/bash
# The citizen proposals desk reader (docs/PROPOSALS.md): the production docket into
# MORNING_REPORT.md ("## Proposals awaiting you", and a Needs-you bullet at 3+ co-signs), then
# ~/projects/organize/collect_reports.py. Run by scripts/hvi_nightly.sh after every nightly
# build run (launchd com.hvi.nightly, 02:00). No model call. Log: ~/Library/Logs/hvi-proposals-desk.log
set -uo pipefail
REPO="${HVI_REPO:-$HOME/projects/human-value-index}"
export PATH="/opt/homebrew/bin:$HOME/.nvm/versions/node/v24.15.0/bin:/usr/local/bin:/usr/bin:/bin"
cd "$REPO" || exit 1
node scripts/proposals-desk.mjs "$@"
