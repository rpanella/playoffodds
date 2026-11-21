# Deploying PlayoffOdds on Forge

One AWS server managed by Forge runs everything: PHP, MySQL, Redis, Node (for the engine CLI), the queue
worker and the scheduler (D28). Snapshot inputs live on the server's disk under `storage/app/private`.

## 1. Server

Create a server in Forge:

| Setting | Value |
|---|---|
| Provider, region | AWS, us-east-1 (where SportsCrunch is) |
| Size | t3.medium (2 vCPU, 4 GB) |
| OS | Ubuntu 24.04 |
| PHP | 8.4 |
| Database | MySQL 8, with a database named `podds` |
| Also | Redis and Node (Forge installs both; the engine needs Node 20 or later) |

After it's provisioned, SSH in and check:

```bash
node --version   # 20 or later
which node       # use this path for NODE_BINARY below, usually /usr/bin/node
```

## 2. Site

- Domain: `playoffodds.com`, with `www` as an alias.
- Repository: `rpanella/playoffodds`, branch `main`, Laravel project type, web directory `/public`.
- Zero-downtime deployments on. Forge then shares `storage/` across releases, so snapshot inputs survive deploys.
- DNS: A records for `playoffodds.com` and `www.playoffodds.com` pointing at the server's IP. Once they resolve,
  add a Let's Encrypt certificate in Forge.

## 3. Environment

Paste this into the site's environment in Forge, then fill in the blanks. Never commit the filled-in version.

```ini
APP_NAME=PlayoffOdds
APP_ENV=production
APP_KEY=                      # php artisan key:generate --show
APP_DEBUG=false
APP_URL=https://playoffodds.com

LOG_CHANNEL=stack
LOG_STACK=daily
LOG_LEVEL=info

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=podds
DB_USERNAME=forge
DB_PASSWORD=                  # from Forge

SESSION_DRIVER=redis
CACHE_STORE=redis             # also holds the per-season snapshot lock and the scheduler's locks
QUEUE_CONNECTION=redis
REDIS_CLIENT=phpredis
REDIS_HOST=127.0.0.1
REDIS_PASSWORD=null
REDIS_PORT=6379
# Laravel re-runs a queued job it thinks has died after this many seconds. The default (90) is shorter than
# the after-finals job's 10-minute limit, so a slow SportsCrunch call could start a duplicate run.
REDIS_QUEUE_RETRY_AFTER=660

FILESYSTEM_DISK=local
MAIL_MAILER=log

NODE_BINARY=/usr/bin/node     # from `which node`
SNAPSHOT_SIMS=100000
SNAPSHOT_AFTER_FINALS=game    # or `window`: one run per slate of games (D53)

SPORTSCRUNCH_API_URL=https://sportscrunch.com
SPORTSCRUNCH_API_KEY=         # the PlayoffOdds account's read-only token
SPORTSCRUNCH_WEBHOOK_SECRET=  # that account's webhook signing secret

# Basic auth for the whole site until launch (D55). The webhook and /up stay open.
SITE_BASIC_AUTH_USER=
SITE_BASIC_AUTH_PASSWORD=
```

## 4. Deploy script

Start from Forge's default Laravel deploy script and add the front-end and engine builds after `composer install`
and before migrations:

```bash
npm ci
npm run build          # the site's assets (Vite+); the Wayfinder plugin calls `php artisan`
npm run build:cli      # the engine and standings CLIs into packages/cli/dist (gitignored)
$FORGE_PHP artisan optimize
$FORGE_PHP artisan migrate --force
```

Keep Forge's queue restart at the end of the script (`$FORGE_PHP artisan queue:restart` if your script doesn't
already include it), so the worker loads the new code.

## 5. Scheduler and queue worker

- **Scheduler:** turn on Forge's Laravel scheduler for the site (`php artisan schedule:run` every minute). It runs the
  daily snapshot at 9:00 ET and the `snapshot:watch` poll every 10 minutes (`php artisan schedule:list` shows both).
- **Queue worker:** add a worker (Forge daemon) with connection `redis`, queue `default`, timeout `600`,
  sleep `3`, 1 process. It runs the after-finals checks queued by webhooks and polls.

## 6. SportsCrunch

On SportsCrunch, in the account that owns PlayoffOdds' token (use a separate account, not PoolCrunch's):

1. Set the account's webhook URL to `https://playoffodds.com/webhooks/sportscrunch`.
2. Create a webhook signing secret and put it in `SPORTSCRUNCH_WEBHOOK_SECRET`.
3. Make sure webhook sending is switched on in SportsCrunch's production environment.

## 7. First run

On the server, from the site's directory (`/home/forge/playoffodds.com/current` with zero-downtime deployments):

```bash
php artisan sportscrunch:sync nfl                 # 32 teams, 272 games
php artisan snapshot:backfill nfl 2026            # one snapshot per day from Sep 9; about 10 minutes
php artisan snapshot:run nfl                      # a live snapshot now; becomes current
php artisan sportscrunch:webhooks nfl --subscribe # subscribe to the season's game updates
php artisan snapshot:list                         # the newest runs, * marks the current one
```

Then send SportsCrunch's test webhook from its admin. The response should be `200 {"status":"ignored","resource":"test"}`,
which proves the URL, the signature and the firewall path. A bad secret gives `401 invalid signature`.

Checks:

- `https://playoffodds.com` asks for the basic-auth credentials; `https://playoffodds.com/up` doesn't.
- `php artisan schedule:list` shows `snapshot:run nfl --trigger=scheduled` daily at 14:00 UTC and `snapshot:watch` every 10 minutes.

## 8. Game day

- A final should produce a `game_final` snapshot within about 2 minutes by webhook (90-second debounce plus the run),
  or within 10 minutes by the poll.
- `php artisan snapshot:list` shows each run's trigger, status and error; `--failed` shows only failures.
- The queue worker's log (Forge, daemon logs) and `storage/logs/laravel-*.log` show webhook rejections and job errors.

## 9. Monthly patching

Forge applies Ubuntu's security updates automatically. Once a month, in a quiet window (a weekday morning, not a game
day), run this as a Forge recipe as `root`. It also updates PHP and nginx, which come from a package source the
automatic updates skip, and reboots if a kernel update needs it.

```bash
#!/bin/bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" upgrade
apt-get -y autoremove
if [ -f /var/run/reboot-required ]; then
    echo "Reboot required; rebooting"
    reboot
fi
```

App dependencies are separate: run `composer audit` and `npm audit` locally and update through a normal deploy.
