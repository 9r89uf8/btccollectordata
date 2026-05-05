import { ConvexHttpClient } from "convex/browser";
import { INGEST_MAX_BYTES } from "../../packages/shared/src/ingest.js";

function trimTrailingSlash(url) {
  return String(url).replace(/\/+$/, "");
}

export function buildIngestUrl(convexSiteUrl) {
  return `${trimTrailingSlash(convexSiteUrl)}/ingest/polymarket`;
}

export function createIngestClient(config) {
  const ingestUrl = buildIngestUrl(config.convexSiteUrl);

  return {
    ingestUrl,
    async sendBatch(batch) {
      const sentAt = Number.isFinite(batch.sentAt) ? batch.sentAt : Date.now();
      const body = JSON.stringify({
        ...batch,
        secret: config.ingestSharedSecret,
        collectorName: config.collectorName,
        sentAt,
      });

      if (body.length > INGEST_MAX_BYTES) {
        throw new Error(
          `Ingest batch too large (${body.length} bytes > ${INGEST_MAX_BYTES})`,
        );
      }

      const response = await fetch(ingestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Convex ingest failed (${response.status}): ${errorText || "unknown error"}`,
        );
      }

      return await response.json();
    },
  };
}

export function createQueryClient(config) {
  const client = new ConvexHttpClient(config.convexUrl, {
    logger: false,
  });

  return {
    client,
    async listActiveMarkets() {
      return await client.query("markets:listActiveCrypto5m", {
        assets: config.cryptoAssets,
      });
    },
  };
}
