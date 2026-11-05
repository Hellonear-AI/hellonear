#!/usr/bin/env bash
# Deploy the committed HEAD to a Proxmox LXC prepared as in deploy/README.md.
# Usage: DEPLOY_HOST=root@<proxmox-node> DEPLOY_CT=<vmid> deploy/deploy.sh   (from an up-to-date main)
# Ships `git archive HEAD` (never the working tree, so no local .env), installs dependencies with the
# lockfiles, swaps the release in, restarts the services and checks their health.
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

echo "waiting for health"
for i in $(seq 1 30); do
  if ct bash -c "'curl -fsS http://127.0.0.1:4100/v1/health >/dev/null && curl -fsS http://127.0.0.1:4000/v1/health >/dev/null'" 2>/dev/null; then
    echo "up: $rev"; exit 0
  fi
  sleep 4
done
echo "not healthy after 2 minutes; logs: journalctl -u hellonear-engine -u hellonear-be -n 100" >&2
exit 1
