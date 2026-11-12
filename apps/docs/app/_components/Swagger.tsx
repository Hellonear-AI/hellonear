"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type SwaggerBundle = (options: Record<string, unknown>) => unknown;
declare global {
  interface Window {
    SwaggerUIBundle?: SwaggerBundle;
  }
}

// Swagger UI only runs in the browser; the prose above it is server-rendered and readable without JavaScript.
// It loads swagger-ui-dist's prebuilt bundle from /swagger (copied by scripts/build-content.mjs), not through the
// bundler: Turbopack breaks swagger-ui-react's OpenAPI resolver, so an opened operation never finished loading.
export function Swagger({ url }: { url: string }) {
  const node = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (window.SwaggerUIBundle) setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !node.current || !window.SwaggerUIBundle) return;
    window.SwaggerUIBundle({ url, domNode: node.current, docExpansion: "list", defaultModelsExpandDepth: 0, tryItOutEnabled: false });
  }, [ready, url]);

  return (
    <section className="swagger" aria-label="OpenAPI reference">
      <link rel="stylesheet" href="/swagger/swagger-ui.css" />
      <Script src="/swagger/swagger-ui-bundle.js" strategy="afterInteractive" onReady={() => setReady(true)} />
      {ready ? null : <p className="muted">Loading the API reference…</p>}
      <div ref={node} />
    </section>
  );
}
