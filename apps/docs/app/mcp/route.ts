import { handle } from "@/lib/mcp";

// Stateless Streamable HTTP: POST one JSON-RPC message, get JSON back. No sessions, so GET (the server-to-client
// stream) and DELETE are 405. Read-only and public, hence CORS *.
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, OPTIONS",
  "access-control-allow-headers": "content-type, accept, mcp-protocol-version, mcp-session-id, authorization",
  "access-control-expose-headers": "mcp-protocol-version",
};

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400, headers: CORS });
  }
  const reply = handle(body);
  if (!reply) return new Response(null, { status: 202, headers: CORS });
  return Response.json(reply, { headers: CORS });
}

export const GET = () =>
  new Response("This MCP server is stateless: POST JSON-RPC messages to this URL.\n", {
    status: 405,
    headers: { ...CORS, allow: "POST, OPTIONS", "content-type": "text/plain; charset=utf-8" },
  });

export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });
