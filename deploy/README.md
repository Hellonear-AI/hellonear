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
7. `/etc/hellonear/` (root, `700`) holds `db.env`, `engine.env`, `be.env` (`600`), with the names from `engine/.env.example` and `apps/be/.env.example`. Keys are generated in the container and never leave it; `ENGINE_API_KEY` is the same in both files. `be.env` sets `COOKIE_SECURE=true` (HTTPS through the tunnel), `AUTH_RECIPIENT` explicitly (the FE must sign for the same value) and `FE_ORIGIN` to the FE's public origin first; more origins can follow, comma-separated (e.g. `http://localhost:3000` for local FE work against this API).

## Deploy

```sh
DEPLOY_HOST=root@<proxmox-node> DEPLOY_CT=<vmid> deploy/deploy.sh
```

Run it from an up-to-date `main`: it refuses any other `HEAD` unless `DEPLOY_ALLOW_BRANCH=1`. It ships `git archive HEAD` of `engine/`, `apps/be/` and `deploy/` (never the working tree, so no local `.env`), runs `bun install --frozen-lockfile`, swaps `/opt/hellonear/app` (the previous release stays in `/opt/hellonear/release-old`), restarts both units and waits for both `/v1/health` (the backend's must report the new `revision`). Refuses to run with uncommitted changes in those folders.

Before it changes anything it checks the box, and it stops with exit `3` (nothing changed) when:
- `/opt/hellonear/app` differs from git at the `REVISION` it runs (sha256 of every file in `engine/`, `apps/be/`, `deploy/`, except `node_modules`): hand edits, or extra files;
- a new migration in `apps/be/migrations/` contains `drop`, `delete`, `truncate` or `alter … type` (comments ignored), or a migration that already ran was changed or removed (it would never run again).

If the services are not healthy within 2 minutes after the swap, it puts `release-old` back with its own units and exits `4` (the bad release stays in `release-bad`); exit `5` means the rollback is not healthy either.

`DEPLOY_CHECK_ONLY=1` runs only these checks. One-off overrides, each needing Axel's approval for that deploy: `DEPLOY_ALLOW_HAND_EDITS=1`, `DEPLOY_ALLOW_DESTRUCTIVE=1`.

`GET /v1/health` on the backend answers `revision`, so `curl https://api-hellonear.jameshub.fun/v1/health` shows what is live.

Manual rollback (needs Axel's approval): `mv /opt/hellonear/app /opt/hellonear/release-bad && mv /opt/hellonear/release-old /opt/hellonear/app && systemctl restart hellonear-engine hellonear-be`.

Logs: `journalctl -u hellonear-engine -u hellonear-be -f`.

## When to deploy (decided 9 Nov, #22)

Axel approves every merge to `main`, and that approval covers deploying that `main` here (root `CLAUDE.md`, rule 3). So after a merge, `main` is deployed without asking again, once the GitHub CI for that commit has passed. Still a separate approval each time: a branch (`DEPLOY_ALLOW_BRANCH=1`), a change to `be.env` or other secrets, a manual rollback.

The deploy must stop by itself, and ask, instead of overwriting or breaking things:
- **Hand edits on the box:** if `/opt/hellonear/app` differs from git at the revision it was deployed from, do not deploy; report it.
- **Destructive migrations:** if a new file in `apps/be/migrations/` contains `drop`, `delete`, `truncate` or `alter … type`, do not deploy; ask Axel. Foreign-key actions (`on delete cascade`, `on update set null`, …) do not count: they delete nothing when the migration runs. The check is `deploy/destructive-sql.sh` (it prints the statements it stopped on); `deploy/test-destructive-sql.sh` runs it on every migration and on known destructive statements.
- **Failed health check:** if either `/v1/health` fails after the swap, roll back to `release-old` automatically and report it.

After each deploy, post one comment on the merged PR: the revision, `/v1/health`, and any rollback. That comment also tells the team the merge is live.

`deploy.sh` makes the three stops above; `deploy/autodeploy/` does the rest.

## Automatic deploy (`deploy/autodeploy/`)

`autodeploy.sh` runs every 2 minutes from a systemd **user** timer on an always-on machine on the LAN (the box has no public SSH). Today that is James's `ct-dev-env`. Each run:
1. fetches `origin/main` into its own clone (`~/.local/share/hellonear-autodeploy/repo`) and reads the box's `REVISION`; if they match, it stops;
2. waits while a GitHub check on that commit is still running; if one failed, it does not deploy and says so on the PR. A merge that changes no CI folder has no checks: it waits 5 minutes after the merge, then goes ahead;
3. runs that commit's `deploy/deploy.sh` and posts one comment on the merged PR (a commit comment for a direct push): the revision, `/v1/health`, and any stop or rollback, mentioning `AUTODEPLOY_NOTIFY` when a person is needed. Only `deploy.sh`'s result lines are posted, never service logs.

One attempt per commit: a stop, a rollback or failed CI is not retried; the next merge is tried as usual. An error before the swap (network, SSH) is retried 3 times. To retry a commit by hand after fixing the cause, delete `~/.local/share/hellonear-autodeploy/state/<sha>`. Run log: `journalctl --user -u hellonear-autodeploy`.

Setup (once, on the LAN machine, as a user with `gh auth login` done and an SSH key for the Proxmox node):

```sh
install -Dm755 deploy/autodeploy/autodeploy.sh ~/.local/bin/hellonear-autodeploy
install -Dm600 deploy/autodeploy/autodeploy.env.example ~/.config/hellonear-autodeploy.env   # then edit
install -Dm644 -t ~/.config/systemd/user deploy/autodeploy/hellonear-autodeploy.{service,timer}
loginctl enable-linger "$USER"
systemctl --user daemon-reload && systemctl --user enable --now hellonear-autodeploy.timer
```

Reinstall `~/.local/bin/hellonear-autodeploy` when `autodeploy.sh` changes (it is a copy, so a checkout never changes a running script). `deploy.sh` itself always comes from the commit being deployed. Stop it: `systemctl --user disable --now hellonear-autodeploy.timer`; then deploy by hand as above.

## Watching the NEAR AI credit and the demo wallet (#43)

- Each finished run logs one line: `journalctl -u hellonear-be | grep 'run usage'` (tokens and cost, no content).
- Totals: `sudo -u postgres psql hellonear -c "select count(*), sum(cost_usd) from runs where started_at > now() - interval '1 day'"`.
- Demo wallet payments: `sudo -u postgres psql hellonear -c "select status, count(*) from wallet_payments group by 1"`.
