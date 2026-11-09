#!/usr/bin/env bash
# Deploy the committed HEAD to a Proxmox LXC prepared as in deploy/README.md.
# Usage: DEPLOY_HOST=root@<proxmox-node> DEPLOY_CT=<vmid> deploy/deploy.sh   (from an up-to-date main)
# Ships `git archive HEAD` (never the working tree, so no local .env), installs dependencies with the
# lockfiles, swaps the release in, restarts the services and checks their health.
#
# It stops by itself instead of overwriting or breaking things (deploy/README.md, "When to deploy"):
#   - the box differs from git at the revision it runs (hand edits)      -> exit 3, nothing changed
#   - a new or changed migration could destroy data                     -> exit 3, nothing changed
#   - the services are not healthy after the swap                       -> rolls back to release-old, exit 4
# DEPLOY_CHECK_ONLY=1 runs the checks and exits (0 if a deploy would go ahead).
# Overrides, only with Axel's approval for that deploy: DEPLOY_ALLOW_HAND_EDITS=1, DEPLOY_ALLOW_DESTRUCTIVE=1.
set -euo pipefail
: "${DEPLOY_HOST:?set DEPLOY_HOST, e.g. root@proxmox-node}"
: "${DEPLOY_CT:?set DEPLOY_CT, the LXC vmid}"
cd "$(git rev-parse --show-toplevel)"
[ -z "$(git status --porcelain -- engine apps/be deploy)" ] || { echo "commit engine/, apps/be/ and deploy/ first" >&2; exit 1; }
# Only what is merged: HEAD must be origin/main (DEPLOY_ALLOW_BRANCH=1 to deploy a branch, e.g. to try a fix; ask first).
git fetch -q origin main
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ] && [ "${DEPLOY_ALLOW_BRANCH:-}" != 1 ]; then
  echo "HEAD is not origin/main; check out an up-to-date main, or set DEPLOY_ALLOW_BRANCH=1" >&2; exit 1
fi
rev=$(git rev-parse --short HEAD)
ct() { ssh -o BatchMode=yes "$DEPLOY_HOST" "pct exec $DEPLOY_CT -- $*"; }
stop() { echo "STOP: $*" >&2; exit 3; }
PATHS=(engine apps/be deploy)

# 1. Hand edits: the live release must be exactly git at the revision it was deployed from.
live=$(ct bash -c "'cat /opt/hellonear/app/REVISION 2>/dev/null || true'")
if [ -n "$live" ]; then
  git cat-file -e "$live^{commit}" 2>/dev/null || stop "the box runs $live, which is not in this clone (git fetch?)"
  tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
  git archive "$live" "${PATHS[@]}" | tar -x -C "$tmp"
  (cd "$tmp" && find "${PATHS[@]}" -type f -print0 | xargs -0 sha256sum) | LC_ALL=C sort -k2 > "$tmp.git"
  ct bash -c "'cd /opt/hellonear/app && find ${PATHS[*]} -type f -not -path \"*/node_modules/*\" -print0 | xargs -0 sha256sum'" | LC_ALL=C sort -k2 > "$tmp.box"
  if ! diff -q "$tmp.git" "$tmp.box" >/dev/null; then
    changed=$({ diff "$tmp.git" "$tmp.box" || true; } | sed -n 's/^[<>] [0-9a-f]* *//p' | LC_ALL=C sort -u | head -20)
    rm -f "$tmp.git" "$tmp.box"
    if [ "${DEPLOY_ALLOW_HAND_EDITS:-}" = 1 ]; then echo "warning: hand edits on the box are overwritten:"$'\n'"$changed" >&2
    else stop "/opt/hellonear/app differs from git $live (hand edits?); files:"$'\n'"$changed"; fi
  else
    echo "box matches git $live"
  fi
  rm -f "$tmp.git" "$tmp.box"
else
  echo "no REVISION on the box: first deploy, nothing to compare"
fi

# 2. Destructive migrations: a new migration that drops, deletes, truncates or retypes data needs Axel.
# A changed migration is also stopped: one that already ran never runs again, so the change would be lost.
if [ -n "$live" ]; then
  added=$(git diff --name-only --diff-filter=A "$live" HEAD -- apps/be/migrations/)
  changed=$(git diff --name-only --diff-filter=MDR "$live" HEAD -- apps/be/migrations/)
  [ -z "$changed" ] || [ "${DEPLOY_ALLOW_DESTRUCTIVE:-}" = 1 ] || stop "migrations changed after they ran (add a new one instead): $changed"
  for f in $added; do
    # Foreign-key actions such as `on delete cascade` are not deletes (deploy/destructive-sql.sh).
    if git show "HEAD:$f" | deploy/destructive-sql.sh >&2; then
      [ "${DEPLOY_ALLOW_DESTRUCTIVE:-}" = 1 ] || stop "$f may destroy data (drop/delete/truncate/alter … type): ask Axel"
      echo "warning: $f may destroy data; going ahead (DEPLOY_ALLOW_DESTRUCTIVE=1)" >&2
    fi
  done
  echo "migrations: ${added:-none new}" | tr '\n' ' '; echo
fi

if [ "${DEPLOY_CHECK_ONLY:-}" = 1 ]; then echo "checks passed; would deploy $rev over ${live:-nothing}"; exit 0; fi

echo "deploying $rev"
git archive --format=tar HEAD engine apps/be deploy | ssh -o BatchMode=yes "$DEPLOY_HOST" \
  "pct exec $DEPLOY_CT -- bash -c 'rm -rf /opt/hellonear/release-new && mkdir -p /opt/hellonear/release-new && tar -x -C /opt/hellonear/release-new'"
ct bash -c "'set -e; cd /opt/hellonear/release-new
  (cd engine && /usr/local/bin/bun install --frozen-lockfile)
  (cd apps/be && /usr/local/bin/bun install --frozen-lockfile)
  echo $rev > REVISION
  install -m644 deploy/systemd/hellonear-*.service /etc/systemd/system/
  chown -R hellonear:hellonear /opt/hellonear/release-new
  rm -rf /opt/hellonear/release-old; [ -d /opt/hellonear/app ] && mv /opt/hellonear/app /opt/hellonear/release-old
  mv /opt/hellonear/release-new /opt/hellonear/app
  systemctl daemon-reload
  systemctl enable --now hellonear-engine hellonear-be >/dev/null
  systemctl restart hellonear-engine hellonear-be'"

# Both services answer health, and the backend's health contains $1 (the new revision after a deploy, so the old process is gone).
healthy() {
  for i in $(seq 1 30); do
    if ct bash -c "'curl -fsS http://127.0.0.1:4100/v1/health >/dev/null && curl -fsS http://127.0.0.1:4000/v1/health | grep -q $1'" 2>/dev/null; then return 0; fi
    sleep 4
  done
  return 1
}

echo "waiting for health"
if healthy "$rev"; then echo "up: $rev"; exit 0; fi

# 3. Not healthy: put the previous release back, with its own systemd units.
echo "not healthy after 2 minutes; rolling back to ${live:-release-old}" >&2
ct bash -c "'journalctl -u hellonear-engine -u hellonear-be -n 30 --no-pager'" >&2 || true
ct bash -c "'set -e; [ -d /opt/hellonear/release-old ]
  rm -rf /opt/hellonear/release-bad; mv /opt/hellonear/app /opt/hellonear/release-bad
  mv /opt/hellonear/release-old /opt/hellonear/app
  install -m644 /opt/hellonear/app/deploy/systemd/hellonear-*.service /etc/systemd/system/
  systemctl daemon-reload
  systemctl restart hellonear-engine hellonear-be'" || { echo "ROLLBACK FAILED: nothing in release-old; fix by hand" >&2; exit 5; }
if healthy ok; then echo "ROLLED BACK: $rev was unhealthy; live is ${live:-the previous release} again (bad release kept in release-bad)" >&2; exit 4; fi
echo "ROLLBACK UNHEALTHY: ${live:-the previous release} is back but not healthy; logs: journalctl -u hellonear-engine -u hellonear-be -n 100" >&2
exit 5
