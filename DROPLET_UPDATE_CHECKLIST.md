# Droplet Update Checklist

Use this after pushing new code to GitHub when the DigitalOcean collector needs to pick up the change.

## Standard Update Flow

SSH into the Droplet, then run:

```bash
cd /opt/btccollectordata
git pull
npm ci
systemctl restart btcgt-collector
journalctl -u btcgt-collector -f
```

## Safer Verification Flow

If you want a quick health check right after restarting:

```bash
cd /opt/btccollectordata
git pull
npm ci
systemctl restart btcgt-collector
systemctl status btcgt-collector
journalctl -u btcgt-collector -n 50 --no-pager
```

## When The Droplet Needs An Update

Update the Droplet if the change touches:

- `collector/`
- shared logic used by the collector in `packages/shared/`
- collector env expectations
- deployment or service behavior

The Droplet usually does **not** need an update for:

- docs-only changes
- Vercel-only UI changes
- web-only styling/content updates that do not affect the collector

## If You Change Collector Env Vars

Edit:

```bash
nano /etc/btcgt/collector.env
```

Then restart:

```bash
systemctl restart btcgt-collector
```

## Important Convex Reminder

Updating the Droplet does **not** update Convex functions.

If the change includes Convex backend code, the normal order is:

1. Push code to GitHub
2. Deploy/update Convex
3. Update the Droplet if collector/shared code changed

## Success Signals

After restart, you want to see:

- service stays `active (running)`
- no `Convex ingest failed` errors
- no `active market refresh failed` errors
- normal collector startup logs

Useful commands:

```bash
systemctl status btcgt-collector
journalctl -u btcgt-collector -f
```
