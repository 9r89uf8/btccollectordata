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

## Decision Engine Rollout Checks

For decision-engine changes, both the Droplet env flag and Convex runtime flags
must allow shadow logging.

On the Droplet, confirm `/etc/btcgt/collector.env` contains:

```bash
ENABLE_DECISION_ENGINE=true
DECISION_PERSIST_OFF_CHECKPOINT_WAITS=false
```

Keep runtime action emission muted for shadow validation:

```bash
npx convex run internal/runtimeFlags:ensureDecisionRuntimeFlagDefaults '{}'
npx convex run internal/runtimeFlags:setDecisionRuntimeFlag '{"key":"decision_engine_enabled","value":true}'
npx convex run internal/runtimeFlags:setDecisionRuntimeFlag '{"key":"decision_emit_actions","value":"wait_only"}'
```

After the collector restarts, wait for one or two target checkpoint windows to
close, then check `/decisions`. A strict policy should still produce `WAIT`
rows. It may produce zero ENTER candidates until the policy is eased.

## Success Signals

After restart, you want to see:

- service stays `active (running)`
- no `Convex ingest failed` errors
- no `active market refresh failed` errors
- normal collector startup logs
- `/decisions` shows recent decision rows once target checkpoints close
- muted would-have-entered rows show as `WAIT` with `actionPreMute`

Useful commands:

```bash
systemctl status btcgt-collector
journalctl -u btcgt-collector -f
```
