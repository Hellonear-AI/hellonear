import { SERVER_INFO, TOOLS } from "@/lib/mcp";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

// Discovery for agents that look for an MCP server at a well-known path.
export const GET = () =>
  Response.json(
    {
      servers: [
        {
          name: SERVER_INFO.name,
          title: SERVER_INFO.title,
          description: "Read-only search and reading of the HelloNear docs and Trust Center.",
          url: `${SITE_URL}/mcp`,
          transport: "streamable-http",
          authentication: "none",
          tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
        },
      ],
    },
    { headers: { "access-control-allow-origin": "*" } },
  );
