# Deploy On Vercel

This guide is for the Next.js web UI.

Recommended production split:

- Vercel hosts the web app
- DigitalOcean hosts the long-running collector
- both point at the same Convex deployment

## Connection Model

The web app does not connect to the Droplet directly.

Traffic flow:

- browser -> Vercel-hosted Next.js app
- Next.js app -> Convex
- DigitalOcean collector -> Convex
- DigitalOcean collector -> Polymarket APIs and WebSockets

So the shared dependency is Convex, not the Droplet.

## What Vercel Needs

Only one env var is required for the UI:

- `NEXT_PUBLIC_CONVEX_URL`

That should point to the same Convex deployment the collector writes to.

Optional:

- `NEXT_PUBLIC_CONVEX_SITE_URL`

The app does not currently require `NEXT_PUBLIC_CONVEX_SITE_URL` in production, but it is harmless if you keep it aligned with the same deployment.

Example values are in [deploy/vercel/project.env.example](/C:/Users/alexa/WebstormProjects/btcgt/deploy/vercel/project.env.example).

## 1. Import The Repo

In Vercel:

1. Create a new project
2. Import `https://github.com/9r89uf8/btccollectordata`
3. Select the repo root as the project root

Vercel has built-in support for Next.js, so no custom framework adapter is needed.

## 2. Build Settings

Recommended settings:

- Framework Preset: `Next.js`
- Root Directory: repository root
- Install Command: `npm ci`
- Build Command: `npm run build`
- Output Directory: leave blank

These defaults match this repo.

## 3. Environment Variables

In Project Settings -> Environment Variables, add:

### Production

```txt
NEXT_PUBLIC_CONVEX_URL=https://your-production-deployment.convex.cloud
```

Optional:

```txt
NEXT_PUBLIC_CONVEX_SITE_URL=https://your-production-deployment.convex.site
```

If you want Preview deployments to read from a different Convex deployment, add a separate Preview value. Vercel applies Production variables to production deploys, Preview variables to non-production branches, and local Development variables can be pulled with `vercel env pull`.

## 4. Deploy

Once the env var is set:

1. Trigger the first deployment
2. Open the deployed URL
3. Confirm the homepage loads catalog data from Convex

## 5. Production Checklist

After deploy, confirm:

- homepage loads without the “Convex not configured” empty state
- active markets render
- `/markets/[slug]` loads replay data
- `/analytics` loads from the same Convex deployment
- collector health reflects the Droplet collector, not local development

## Preview Strategy

Recommended:

- Production env -> production Convex deployment
- Preview env -> dev/staging Convex deployment

That keeps preview branches from reading or mutating the production dataset unintentionally.

## Local Development With Vercel CLI

If you link the repo to Vercel, you can pull development env vars locally:

```bash
vercel env pull
```

That creates a local env file from the Vercel Development environment.

## Notes

- You do not need to expose the Droplet publicly for the web app to work.
- The Droplet only needs outbound access to Convex and Polymarket.
- If the Droplet is down, the UI still works, but data stops updating because nothing is writing new snapshots or BTC ticks.
