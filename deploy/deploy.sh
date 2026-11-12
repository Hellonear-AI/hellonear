#!/usr/bin/env bash
# Deploy the committed HEAD to a Proxmox LXC prepared as in deploy/README.md.
# Usage: DEPLOY_HOST=root@<proxmox-node> DEPLOY_CT=<vmid> deploy/deploy.sh   (from an up-to-date main)
# Ships `git archive HEAD` (never the working tree, so no local .env), installs dependencies with the
# lockfiles, swaps the release in, restarts the services and checks their health. The web app (apps/fe) is
# built here, on the deploying machine (`next build` needs ~1.5 GB, more than the box can spare), and only
# its `.next` output is shipped; the box runs `next start` (#125). The landing page (apps/landing) is built and shipped
# the same way and runs on port 3100 (#266).
#
# It stops by itself instead of overwriting or breaking things (deploy/README.md, "When to deploy"):
#   - the box differs from git at the revision it runs (hand edits)      -> exit 3, nothing changed
#   - a new or changed migration could destroy data                     -> exit 3, nothing changed
#   - the services are not healthy after the swap                       -> rolls back to release-old, exit 4
# DEPLOY_CHECK_ONLY=1 runs the checks and exits (0 if a deploy would go ahead).
# Overrides, only with Axel's approval for that deploy: DEPLOY_ALLOW_HAND_EDITS=1, DEPLOY_ALLOW_DESTRUCTIVE=1.
# FE build: DEPLOY_FE_API_URL (default the hosted API) becomes NEXT_PUBLIC_API_URL; bun and node are taken from
# PATH, then /opt/node/bin and ~/.bun/bin. Landing build: DEPLOY_LANDING_VIDEO_URL (optional) becomes
# NEXT_PUBLIC_DEMO_VIDEO_URL; without it the demo section shows its placeholder (the video is not in git).
set -euo pipefail
: "${DEPLOY_HOST:?set DEPLOY_HOST, e.g. root@proxmox-node}"
: "${DEPLOY_CT:?set DEPLOY_CT, the LXC vmid}"
cd "$(git rev-parse --show-toplevel)"
[ -z "$(git status --porcelain -- engine apps/be apps/fe apps/landing deploy)" ] || { echo "commit engine/, apps/be/, apps/fe/, apps/landing/ and deploy/ first" >&2; exit 1; }
# Only what is merged: HEAD must be origin/main (DEPLOY_ALLOW_BRANCH=1 to deploy a branch, e.g. to try a fix; ask first).
git fetch -q origin main
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ] && [ "${DEPLOY_ALLOW_BRANCH:-}" != 1 ]; then
  echo "HEAD is not origin/main; check out an up-to-date main, or set DEPLOY_ALLOW_BRANCH=1" >&2; exit 1
fi
rev=$(git rev-parse --short HEAD)
ct() { ssh -o BatchMode=yes "$DEPLOY_HOST" "pct exec $DEPLOY_CT -- $*"; }
stop() { echo "STOP: $*" >&2; exit 3; }
PATHS=(engine apps/be apps/fe apps/landing deploy)
FE_API_URL=${DEPLOY_FE_API_URL:-https://api.hellonear.xyz}
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

# 1. Hand edits: the live release must be exactly git at the revision it was deployed from. Only the folders
# the box has are compared (a release from before #125 has no apps/fe, one from before #266 no apps/landing); build
# output and dependencies are not.
live=$(ct bash -c "'cat /opt/hellonear/app/REVISION 2>/dev/null || true'")
if [ -n "$live" ]; then
  git cat-file -e "$live^{commit}" 2>/dev/null || stop "the box runs $live, which is not in this clone (git fetch?)"
  read -r -a present <<<"$(ct bash -c "'cd /opt/hellonear/app && ls -d ${PATHS[*]} 2>/dev/null'" | tr '\n' ' ')"
  mkdir "$tmp/live"
  git archive "$live" "${present[@]}" | tar -x -C "$tmp/live"
  (cd "$tmp/live" && find "${present[@]}" -type f -print0 | xargs -0 sha256sum) | LC_ALL=C sort -k2 > "$tmp.git"
  ct bash -c "'cd /opt/hellonear/app && find ${present[*]} -type f -not -path \"*/node_modules/*\" -not -path \"apps/fe/.next/*\" -not -path \"apps/landing/.next/*\" -print0 | xargs -0 sha256sum'" | LC_ALL=C sort -k2 > "$tmp.box"
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

# 3. Build the web app and the landing page here from the same `git archive HEAD`; a failed build changes nothing
# on the box.
echo "building apps/fe (NEXT_PUBLIC_API_URL=$FE_API_URL)"
mkdir "$tmp/fe"
git archive HEAD apps/fe | tar -x -C "$tmp/fe"
(cd "$tmp/fe/apps/fe" && export PATH="$PATH:/opt/node/bin:$HOME/.bun/bin" \
  && bun install --frozen-lockfile >/dev/null \
  && NEXT_PUBLIC_API_URL="$FE_API_URL" NEXT_TELEMETRY_DISABLED=1 bun run build >/dev/null) \
  || { echo "apps/fe build failed; nothing changed on the box" >&2; exit 1; }
echo "building apps/landing"
mkdir "$tmp/landing"
git archive HEAD apps/landing | tar -x -C "$tmp/landing"
(cd "$tmp/landing/apps/landing" && export PATH="$PATH:/opt/node/bin:$HOME/.bun/bin" \
  && bun install --frozen-lockfile >/dev/null \
  && NEXT_PUBLIC_DEMO_VIDEO_URL="${DEPLOY_LANDING_VIDEO_URL:-}" NEXT_TELEMETRY_DISABLED=1 bun run build >/dev/null) \
  || { echo "apps/landing build failed; nothing changed on the box" >&2; exit 1; }

echo "deploying $rev"
git archive --format=tar HEAD "${PATHS[@]}" | ssh -o BatchMode=yes "$DEPLOY_HOST" \
  "pct exec $DEPLOY_CT -- bash -c 'rm -rf /opt/hellonear/release-new && mkdir -p /opt/hellonear/release-new && tar -x -C /opt/hellonear/release-new'"
tar -C "$tmp/fe/apps/fe" --exclude=.next/cache -cf - .next | ssh -o BatchMode=yes "$DEPLOY_HOST" \
  "pct exec $DEPLOY_CT -- tar -x -C /opt/hellonear/release-new/apps/fe"
tar -C "$tmp/landing/apps/landing" --exclude=.next/cache -cf - .next | ssh -o BatchMode=yes "$DEPLOY_HOST" \
  "pct exec $DEPLOY_CT -- tar -x -C /opt/hellonear/release-new/apps/landing"
ct bash -c "'set -e; cd /opt/hellonear/release-new
  (cd engine && /usr/local/bin/bun install --frozen-lockfile)
  (cd apps/be && /usr/local/bin/bun install --frozen-lockfile)
  (cd apps/fe && /usr/local/bin/bun install --frozen-lockfile --production)
  (cd apps/landing && /usr/local/bin/bun install --frozen-lockfile --production)
  echo $rev > REVISION
  install -m644 deploy/systemd/hellonear-*.service /etc/systemd/system/
  chown -R hellonear:hellonear /opt/hellonear/release-new
  rm -rf /opt/hellonear/release-old; [ -d /opt/hellonear/app ] && mv /opt/hellonear/app /opt/hellonear/release-old
  mv /opt/hellonear/release-new /opt/hellonear/app
  systemctl daemon-reload
  systemctl enable --now hellonear-engine hellonear-be hellonear-fe hellonear-landing >/dev/null
  systemctl restart hellonear-engine hellonear-be hellonear-fe hellonear-landing'"

# The services answer health, and the backend's health contains $1 (the new revision after a deploy, so the old
# process is gone). The web app and the landing page must answer their home page when the release has them (not
# before #125 and #266).
healthy() {
  for i in $(seq 1 30); do
    if ct bash -c "'curl -fsS http://127.0.0.1:4100/v1/health >/dev/null && curl -fsS http://127.0.0.1:4000/v1/health | grep -q $1 \
      && { [ ! -d /opt/hellonear/app/apps/fe/.next ] || curl -fsS -o /dev/null http://127.0.0.1:3000/; } \
      && { [ ! -d /opt/hellonear/app/apps/landing/.next ] || curl -fsS -o /dev/null http://127.0.0.1:3100/; }'" 2>/dev/null; then return 0; fi
    sleep 4
  done
  return 1
}

echo "waiting for health"
if healthy "$rev"; then echo "up: $rev"; exit 0; fi

# 4. Not healthy: put the previous release back, with its own systemd units.
echo "not healthy after 2 minutes; rolling back to ${live:-release-old}" >&2
ct bash -c "'journalctl -u hellonear-engine -u hellonear-be -n 30 --no-pager'" >&2 || true
ct bash -c "'set -e; [ -d /opt/hellonear/release-old ]
  rm -rf /opt/hellonear/release-bad; mv /opt/hellonear/app /opt/hellonear/release-bad
  mv /opt/hellonear/release-old /opt/hellonear/app
  install -m644 /opt/hellonear/app/deploy/systemd/hellonear-*.service /etc/systemd/system/
  systemctl daemon-reload
  systemctl restart hellonear-engine hellonear-be
  if [ -d /opt/hellonear/app/apps/fe/.next ]; then systemctl restart hellonear-fe; else systemctl stop hellonear-fe 2>/dev/null || true; fi
  if [ -d /opt/hellonear/app/apps/landing/.next ]; then systemctl restart hellonear-landing; else systemctl stop hellonear-landing 2>/dev/null || true; fi'" || { echo "ROLLBACK FAILED: nothing in release-old; fix by hand" >&2; exit 5; }
if healthy ok; then echo "ROLLED BACK: $rev was unhealthy; live is ${live:-the previous release} again (bad release kept in release-bad)" >&2; exit 4; fi
echo "ROLLBACK UNHEALTHY: ${live:-the previous release} is back but not healthy; logs: journalctl -u hellonear-engine -u hellonear-be -n 100" >&2
exit 5
