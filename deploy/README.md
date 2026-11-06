# deploy

Hosted demo (#22): the engine and the backend run natively (no Docker) in one Debian 13 LXC on a Proxmox node, with Postgres 17 + pgvector in the same container. Public HTTPS comes from a Cloudflare Tunnel that runs elsewhere and points at the container's LAN address; nothing in the container listens publicly.

| Service | Port (container only) | Unit |
|---|---|---|
| engine | 4100 | `hellonear-engine.service` |
| backend | 4000 | `hellonear-be.service` (applies migrations at start) |
| Postgres 17 + pgvector 0.8 | 5432 (loopback) | `postgresql` |

## One-time container setup (done 5 Nov for the team's container)

1. Debian 13 LXC, unprivileged, 2 cores, 2 GB RAM, 16 GB disk, no nesting (no Docker needed).
2. `apt-get install curl ca-certificates git unzip xz-utils postgresql postgresql-17-pgvector`.
3. Node **24.22.1** in `/opt/node` (symlinks in `/usr/local/bin`) and Bun **1.3.9** in `/usr/local/bin`, the versions the repo pins.
4. User `hellonear`; role and database `hellonear` with `create extension vector`.
5. Proxmox firewall on the container (`firewall=1` on `net0`, `policy_in: DROP`): in only the backend port 4000 from the tunnel host, SSH from the LAN, and ICMP. The engine (4100) listens on all interfaces, so the firewall is what keeps it private; Postgres listens on loopback only. Checked 5 Nov: 4100 blocked from the LAN, reachable inside the container.
   **Keep `cloudflared` off this container.** The backend's `/internal/*` routes answer only on loopback (#52); that is safe only while the tunnel connects from another host. Run inside the container, tunnel requests would come from 127.0.0.1 and pass that check (the engine key would be the only one left).
6. IPv6 off in the container (`/etc/sysctl.d/90-hellonear-no-ipv6.conf`: `net.ipv6.conf.all.disable_ipv6 = 1`, same for `default`). The LAN hands out an IPv6 route that does not reach the internet, and `bun install` waits on IPv6 without falling back (the first deploy hung on it, 5 Nov).
7. `/etc/hellonear/` (root, `700`) holds `db.env`, `engine.env`, `be.env` (`600`), with the names from `engine/.env.example` and `apps/be/.env.example`. Keys are generated in the container and never leave it; `ENGINE_API_KEY` is the same in both files. `be.env` sets `COOKIE_SECURE=true` (HTTPS through the tunnel), `AUTH_RECIPIENT` explicitly (the FE must sign for the same value) and `FE_ORIGIN` to the FE's public origin.

## Deploy

```sh
DEPLOY_HOST=root@<proxmox-node> DEPLOY_CT=<vmid> deploy/deploy.sh
```

Run it from an up-to-date `main`: it refuses any other `HEAD` unless `DEPLOY_ALLOW_BRANCH=1`. It ships `git archive HEAD` of `engine/`, `apps/be/` and `deploy/` (never the working tree, so no local `.env`), runs `bun install --frozen-lockfile`, swaps `/opt/hellonear/app` (the previous release stays in `/opt/hellonear/release-old`), restarts both units and waits for both `/v1/health`. Refuses to run with uncommitted changes in those folders.

Rollback: `mv /opt/hellonear/app /opt/hellonear/release-bad && mv /opt/hellonear/release-old /opt/hellonear/app && systemctl restart hellonear-engine hellonear-be`.

Logs: `journalctl -u hellonear-engine -u hellonear-be -f`.

Deploying needs Axel's approval each time (root `CLAUDE.md`).

## Watching the NEAR AI credit and the demo wallet (#43)

- Each finished run logs one line: `journalctl -u hellonear-be | grep 'run usage'` (tokens and cost, no content).
- Totals: `sudo -u postgres psql hellonear -c "select count(*), sum(cost_usd) from runs where started_at > now() - interval '1 day'"`.
- Demo wallet payments: `sudo -u postgres psql hellonear -c "select status, count(*) from wallet_payments group by 1"`.
