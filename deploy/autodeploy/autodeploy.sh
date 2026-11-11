#!/usr/bin/env bash
# Deploys a new origin/main to the hosted demo once its GitHub CI passed, then comments on the merged PR
# (deploy/README.md, "When to deploy"). Run every 2 minutes by hellonear-autodeploy.timer on an always-on
# machine on the LAN (the box has no public SSH). Needs git, gh (logged in, for the CI status and the
# comment), ssh to DEPLOY_HOST, flock and curl.
#
# One attempt per commit: a deploy that deploy.sh stopped (hand edits, destructive migration) or rolled
# back is not retried; the next merge, or a person, takes it from there. Errors before the swap (network,
# SSH) are retried up to 3 times.
set -euo pipefail
: "${DEPLOY_HOST:?set DEPLOY_HOST, e.g. root@proxmox-node}"
: "${DEPLOY_CT:?set DEPLOY_CT, the LXC vmid}"
REPO=${AUTODEPLOY_REPO:-Hellonear-AI/hellonear}
DIR=${AUTODEPLOY_DIR:-$HOME/.local/share/hellonear-autodeploy}
HEALTH_URL=${AUTODEPLOY_HEALTH_URL:-https://api.hellonear.xyz/v1/health}
NOTIFY=${AUTODEPLOY_NOTIFY:-}   # e.g. "@someone": mentioned when a deploy needs a person

mkdir -p "$DIR/state" "$DIR/logs"
exec 9>"$DIR/lock"
flock -n 9 || exit 0   # a deploy is still running
log() { echo "$(date -u +%FT%TZ) $*"; }

# A clone of its own, so it never touches anyone's working copy.
[ -d "$DIR/repo/.git" ] || git clone -q "${AUTODEPLOY_REMOTE:-https://github.com/$REPO.git}" "$DIR/repo"
cd "$DIR/repo"
git fetch -q origin main
sha=$(git rev-parse origin/main)
short=$(git rev-parse --short "$sha")

live=$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$DEPLOY_HOST" "pct exec $DEPLOY_CT -- cat /opt/hellonear/app/REVISION" 2>/dev/null || true)
[ -n "$live" ] || { log "cannot read the live REVISION; trying again later"; exit 0; }
[ "$(git rev-parse -q --verify "$live^{commit}" || true)" = "$sha" ] && exit 0   # already live
state="$DIR/state/$sha"
if [ -e "$state" ]; then
  tries=$(cat "$state")
  [ "$tries" = done ] && exit 0
  [ "$tries" -ge 3 ] && exit 0
else
  tries=0
fi

# The merged PR to report on; a direct push to main gets a commit comment instead.
pr=$(gh api "repos/$REPO/commits/$sha/pulls" --jq '.[0].number // empty' 2>/dev/null || true)
comment() {
  if [ -n "$pr" ]; then gh pr comment "$pr" --repo "$REPO" --body "$1" >/dev/null
  else gh api "repos/$REPO/commits/$sha/comments" -f body="$1" >/dev/null; fi
}

# CI for this commit: wait while any check runs; never deploy on a failed one. A merge that touches no CI
# folder has no checks; wait 5 minutes after it so a workflow that is about to start is not missed.
checks=$(gh api "repos/$REPO/commits/$sha/check-runs?per_page=100" --jq '.check_runs[] | "\(.name)\t\(.status)\t\(.conclusion)"')
if [ -n "$checks" ] && grep -qvP '\tcompleted\t' <<<"$checks"; then log "$short: CI still running"; exit 0; fi
failed=$(awk -F'\t' 'NF && $3 !~ /^(success|skipped|neutral)$/ {print $1" ("$3")"}' <<<"$checks" | paste -sd, -)
if [ -n "$failed" ]; then
  log "$short: CI failed: $failed; not deploying"
  echo done > "$state"
  comment "Not deployed to the hosted demo: CI failed for \`$short\`: $failed. The demo still runs \`$live\`. The next merge with green CI is deployed. $NOTIFY"
  exit 0
fi
if [ -z "$checks" ] && [ $(( $(date +%s) - $(git log -1 --format=%ct "$sha") )) -lt 300 ]; then exit 0; fi
ci=$( [ -n "$checks" ] && awk -F'\t' '{print $1}' <<<"$checks" | paste -sd, - | sed 's/^/passed: /' || echo "no checks for this commit (no CI folder changed)")

log "$short: deploying over $live ($ci)"
git checkout -q --detach "$sha"
logfile="$DIR/logs/$short.log"
set +e
DEPLOY_HOST="$DEPLOY_HOST" DEPLOY_CT="$DEPLOY_CT" ./deploy/deploy.sh >"$logfile" 2>&1
code=$?
set -e
# Only deploy.sh's own result lines go to GitHub, never the raw log (it holds service logs).
why=$({ grep -E '^(ROLLED BACK|ROLLBACK|not healthy|warning)' "$logfile" || true; sed -n '/^STOP/,$p' "$logfile"; } | head -15)
health=$(curl -fsS --max-time 15 "$HEALTH_URL" 2>/dev/null || echo "no answer")
log "$short: deploy.sh exit $code"

case $code in
  0) echo done > "$state"
     comment "Live on the hosted demo: \`main\` \`$short\` (automatic deploy after the merge).
- Before: \`$live\`, and the box matched git at that revision. CI: $ci.
- \`GET /v1/health\` → \`$health\`. No rollback.
- Rollback target: \`$live\` (\`/opt/hellonear/release-old\`)." ;;
  3) echo done > "$state"
     comment "Not deployed to the hosted demo: \`$short\` stopped before anything changed. The demo still runs \`$live\`.
\`\`\`
$why
\`\`\`
A person has to decide (deploy/README.md). $NOTIFY" ;;
  4) echo done > "$state"
     comment "Not live: \`$short\` was not healthy after the swap, so the hosted demo was rolled back to \`$live\` automatically.
\`\`\`
$why
\`\`\`
\`GET /v1/health\` → \`$health\`. The bad release is kept in \`/opt/hellonear/release-bad\`. $NOTIFY" ;;
  5) echo done > "$state"
     comment "**Hosted demo down:** \`$short\` was not healthy and the rollback to \`$live\` did not come back either.
\`\`\`
$why
\`\`\`
\`GET /v1/health\` → \`$health\`. Needs a person now. $NOTIFY" ;;
  *) tries=$((tries + 1)); echo "$tries" > "$state"
     if [ "$tries" -ge 3 ]; then
       comment "Not deployed to the hosted demo: \`$short\` failed 3 times before the swap (exit $code; network or SSH?). The demo still runs \`$live\`. $NOTIFY"
     fi ;;
esac
