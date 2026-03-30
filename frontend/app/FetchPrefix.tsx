"use client";

import { useEffect } from "react";

import { API_BASE, DASHBOARD_BASE } from "./utils/appPaths";

const prefixString = (value: string) => {
  if (!value.startsWith("/")) return value;
  if (value.startsWith(API_BASE) || value.startsWith(DASHBOARD_BASE)) return value;
  if (value.startsWith("/api")) {
    return `${API_BASE}${value}`;
  }
  if (value.startsWith("/dashboard")) {
    return `${DASHBOARD_BASE}${value}`;
  }
  if (value.startsWith("/labelcomp")) {
    return `${DASHBOARD_BASE}${value}`;
  }
  if (value.startsWith("/webtest")) {
    return `${DASHBOARD_BASE}${value}`;
  }
  if (value.startsWith("/search")) {
    return `${DASHBOARD_BASE}${value}`;
  }
  if (value.startsWith("/drugtox")) {
    return `${DASHBOARD_BASE}${value}`;
  }
  return value;
};

const rewriteInput = (input: RequestInfo | URL) => {
  if (typeof input === "string") {
    return prefixString(input);
  }

  const url = input instanceof URL ? input : new URL(input.url, window.location.origin);
  if (url.origin !== window.location.origin) {
    return input;
  }

  const relative = `${url.pathname}${url.search}${url.hash}`;
  const rewritten = prefixString(relative);

  if (input instanceof URL) {
    return rewritten === relative ? input : new URL(`${window.location.origin}${rewritten}`);
  }

  if (rewritten === relative) {
    return input;
  }

  return new Request(rewritten, input as RequestInit);
};

const FetchPrefix = () => {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    const overrideFetch: typeof window.fetch = (input, init) => {
      const rewritten = rewriteInput(input);
      return originalFetch(rewritten, init);
    };
    window.fetch = overrideFetch;
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return null;
};

export default FetchPrefix;
