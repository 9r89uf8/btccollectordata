"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { getPublicConvexUrl } from "@/lib/convexUrl";

const convexUrl = getPublicConvexUrl();
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

export function ConvexClientProvider({ children }) {
  if (!convex) {
    return children;
  }

  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
