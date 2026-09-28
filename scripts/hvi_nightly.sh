#!/bin/bash
# HVI improvement loop (Scott, 2026-09-27: "set up a regular loop to continue the
# improvement of the HVI tool ... I would like to really experiment with this").
#
#   hvi_nightly.sh build      # nightly 02:00: ship the top ROADMAP item
#   hvi_nightly.sh playtest   # Saturdays 01:00: play the site, file friction to ROADMAP
#   hvi_nightly.sh --dry-run build
#
# Readers: docs/ROADMAP.md is read by this job; its output lands in MORNING_REPORT.md,
# which organize/collect_reports.py puts on Scott's desk. HVI ships on green checks
# (Scott's standing rule), so unlike organize/nightly_sweep.sh this one commits and pushes.
set -uo pipefail

REPO="$HOME/projects/human-value-index"
LOG="$HOME/Library/Logs/hvi-nightly.log"
CLAUDE="$HOME/.local/bin/claude"
export PATH="/opt/homebrew/bin:$HOME/.nvm/versions/node/v24.15.0/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"

DRY=0; [ "${1:-}" = "--dry-run" ] && { DRY=1; shift; }
MODE="${1:-build}"
say() { printf '%s [%s] %s\n' "$(date '+%Y-%m-%dT%H:%M:%S')" "$MODE" "$*" | tee -a "$LOG"; }
[ -x "$CLAUDE" ] || { say "no claude CLI at $CLAUDE"; exit 1; }
cd "$REPO" || { say "no repo"; exit 1; }

COMMON='You are the HVI improvement loop, running unattended on Scott'"'"'s Mac. Work only in this repo.
First read: CLAUDE.md rules in ~/projects/CLAUDE.md (MORNING_REPORT parser rules), DESK_ANSWERS.md (Scott'"'"'s answers; settled),
MORNING_REPORT.md, docs/ROADMAP.md (backlog + GUARDRAILS, obey them), docs/SPEC.md, docs/CITY_SPEC.md, docs/design-system.md.
Tone: every user-facing string in the cold Overlord voice. Terminal aesthetic. Mobile-first (44px targets, 16px inputs).
Honesty: report exactly what you did and did not verify. Commit messages end with a line: Claude-Session: hvi-nightly
HEADLESS RULE: you run as a one-shot session. The moment you stop replying, the process exits and nothing resumes.
Never wait for timers, scheduled in-game events, background jobs or "later". Verify time-dependent behaviour by
simulating the machine clock in a check script, not by waiting for real time. Finish (ship or branch) before you stop.'

if [ "$MODE" = "playtest" ]; then
  BUDGET=3600
  PROMPT="$COMMON

TASK (playtest): play https://humanvalueindex.com as a new user would, on phone size (agent-browser, 390x844 touch) and desktop:
logon, an interview (text; you may answer as a plausible persona; do not submit more than one real interview per run),
result, appeal UI (do not file), pen, cube, city 2D/3D/district/building, index, referral pick list (do not file).
Note every bug, confusion, dead end, slow moment, ugly screen, joke that falls flat, and every missing thing a player
would want to do. Add them to docs/ROADMAP.md as concise backlog items (bugs near the top), dedupe against existing items.
Save screenshots to docs/screens/playtest/<date>/. Commit docs changes (git add docs; commit; pull --rebase --autostash; push).
Add a short '## Playtest' section to MORNING_REPORT.md (top 5 findings), run ~/projects/organize/collect_reports.py."
else
  BUDGET=5400
  PROMPT="$COMMON

TASK (build): take the TOP backlog item in docs/ROADMAP.md that is not [blocked] and fits one night (split it if needed and
do the first slice). Build it well: read the relevant code first, keep the design system, write/extend checks in scripts/.
Before shipping: npm run build clean; every node scripts/check-*.mjs passes; python3 scripts/check_sprite_qa.py passes;
run it locally (npx vite + netlify functions:serve) and look at screenshots (agent-browser) at 390x844 and 1440.
Ship: git add the files you changed (never unrelated working-tree changes), commit, git pull --rebase --autostash, git push,
then wait for the Netlify deploy (netlify api listSiteDeploys site 3ac3fcb8-cab4-489b-8ea9-1e4153b87941) to reach ready.
If anything fails and you cannot fix it within budget: do NOT push; leave work on a branch nightly/<date> and say so.
Update docs/ROADMAP.md (move to Done with commit, or mark progress/blocked). Write MORNING_REPORT.md: a '## Shipped' bullet
(what, commit, how to see it) and '## Needs you' only for real decisions (one bullet each, Options: when a pick).
Run ~/projects/organize/collect_reports.py. Stay within the ROADMAP guardrail budgets."
fi

TOOLS=(Read Grep Glob Edit Write
  "Bash(npm run build:*)" "Bash(npm ci:*)" "Bash(node scripts/*)" "Bash(node --input-type=module:*)"
  "Bash(python3 scripts/*)" "Bash(/opt/homebrew/bin/python3 scripts/*)" "Bash(python3 -c:*)"
  "Bash(git status:*)" "Bash(git diff:*)" "Bash(git log:*)" "Bash(git add:*)" "Bash(git commit:*)"
  "Bash(git pull:*)" "Bash(git push:*)" "Bash(git checkout:*)" "Bash(git branch:*)" "Bash(git stash:*)"
  "Bash(npx vite:*)" "Bash(netlify functions:serve:*)" "Bash(netlify api listSiteDeploys:*)"
  "Bash(netlify blobs:get:*)" "Bash(netlify blobs:list:*)" "Bash(agent-browser:*)"
  "Bash(higgsfield account status:*)" "Bash(curl -s:*)" "Bash(ls:*)" "Bash(sleep:*)" "Bash(kill:*)" "Bash(lsof:*)"
  "Bash(python3 ~/projects/organize/collect_reports.py:*)" "Bash(python3 /Users/birdsperson/projects/organize/collect_reports.py:*)")

if [ $DRY -eq 1 ]; then say "dry run: would run claude -p (${#PROMPT} chars prompt, budget ${BUDGET}s)"; exit 0; fi

say "start"
# No `timeout` on macOS; perl alarm is the budget (same as organize/nightly_sweep.sh).
perl -e 'alarm shift; exec @ARGV' "$BUDGET" \
  "$CLAUDE" -p "$PROMPT" --model opus --permission-mode acceptEdits --allowedTools "${TOOLS[@]}" \
  >> "$LOG" 2>&1
rc=$?
say "end rc=$rc"
exit 0
