function normalizeEnvValue(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (
    trimmed === "" ||
    trimmed.toLowerCase() === "undefined" ||
    trimmed.toLowerCase() === "null"
  ) {
    return null;
  }

  return trimmed;
}

export function getPublicConvexUrl() {
  const value = normalizeEnvValue(process.env.NEXT_PUBLIC_CONVEX_URL);

  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}
