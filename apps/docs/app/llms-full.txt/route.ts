import { llmsFullTxt } from "@/lib/content";

export const dynamic = "force-static";

export const GET = () => new Response(llmsFullTxt(), { headers: { "content-type": "text/plain; charset=utf-8" } });
