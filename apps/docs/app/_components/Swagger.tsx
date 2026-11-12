"use client";

import dynamic from "next/dynamic";
import "swagger-ui-react/swagger-ui.css";

// Swagger UI only runs in the browser; the prose above it is server-rendered and readable without JavaScript.
const SwaggerUI = dynamic(() => import("swagger-ui-react"), { ssr: false, loading: () => <p className="muted">Loading the API reference…</p> });

export function Swagger({ url }: { url: string }) {
  return (
    <section className="swagger" aria-label="OpenAPI reference">
      <SwaggerUI url={url} docExpansion="list" defaultModelsExpandDepth={0} tryItOutEnabled={false} />
    </section>
  );
}
