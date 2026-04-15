# Deploy On DigitalOcean

This guide is for the long-running collector process. The recommended production split is:

- web UI on Vercel
- collector on a DigitalOcean Droplet
- one shared Convex deployment

## Connection Model

The connection flow is:

- browser / web UI -> Convex
- collector Droplet -> Convex
- collector Droplet -> Polymarket RTDS, CLOB HTTP, and market WebSocket

The web app does not talk to the Droplet directly.

What each side needs:

- Vercel web app:
  - `NEXT_PUBLIC_CONVEX_URL`
- Droplet collector:
  - `CONVEX_URL`
  - `CONVEX_SITE_URL`
  - `INGEST_SHARED_SECRET`

The UI and the Droplet must use the same Convex deployment.

## Recommended Droplet

For the collector alone:

- Basic Droplet
- Ubuntu LTS
- 1 GB RAM / 1 vCPU

That gives enough headroom for Node, long-lived WebSockets, polling, logs, and normal memory spikes.

## 1. Prepare Convex

Make sure your production Convex deployment already has:

- the correct `INGEST_SHARED_SECRET`
- the deployment URL you want both the UI and the collector to use

## 2. Create The Droplet

Recommended:

- Ubuntu LTS
- add your SSH key at creation time
- if this box only runs the collector, you only need SSH inbound

## 3. Install Node And Git

SSH into the Droplet and run:

```bash
sudo apt update
sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git build-essential
node -v
npm -v
```

The collector requires Node 21 or newer.

## 4. Create A Service User

```bash
sudo useradd --system --create-home --shell /bin/bash btcgt
sudo mkdir -p /opt /etc/btcgt
sudo chown -R $USER:$USER /opt
```

## 5. Clone The Repo

```bash
cd /opt
git clone https://github.com/9r89uf8/btccollectordata.git
cd /opt/btccollectordata
npm ci
```

If you use a private repo later, switch to SSH cloning.

## 6. Create The Collector Env File

Copy the production example:

```bash
sudo cp /opt/btccollectordata/deploy/digitalocean/collector.env.example /etc/btcgt/collector.env
sudo nano /etc/btcgt/collector.env
```

Set these values at minimum:

- `CONVEX_URL`
- `CONVEX_SITE_URL`
- `INGEST_SHARED_SECRET`

Recommended production defaults in that file already include:

- `SNAPSHOT_POLL_MS=5000`
- `PERSIST_MARKET_RAW_EVENTS=false`
- `CLOB_REQUEST_TIMEOUT_MS=2500`
- `CLOB_MAX_ATTEMPTS=2`

Those settings keep storage lower and make poll overruns less likely on a 5-second cadence.

## 7. Install The systemd Service

Copy the unit:

```bash
sudo cp /opt/btccollectordata/deploy/digitalocean/collector.service /etc/systemd/system/btcgt-collector.service
sudo chown -R btcgt:btcgt /opt/btccollectordata
sudo systemctl daemon-reload
sudo systemctl enable btcgt-collector
sudo systemctl start btcgt-collector
```

Check status:

```bash
sudo systemctl status btcgt-collector
sudo journalctl -u btcgt-collector -f
```

## 8. Updating The Collector

From the Droplet:

```bash
cd /opt/btccollectordata
git pull
npm ci
sudo systemctl restart btcgt-collector
```

## 9. Deploy The Web App Separately

If you deploy the Next.js app on Vercel, set:

```txt
NEXT_PUBLIC_CONVEX_URL=https://your-production-deployment.convex.cloud
```

That UI will then read the same Convex data the Droplet collector is writing.

## Operational Checks

After the collector is running, confirm in the UI:

- latest Chainlink BTC is live
- collector health is `ok`
- last poll status is visible
- poll overrun / poll failure / partial poll counters move only occasionally

If poll overruns climb quickly, tighten:

- `CLOB_REQUEST_TIMEOUT_MS`
- `CLOB_MAX_ATTEMPTS`

before lowering `SNAPSHOT_POLL_MS` further.
