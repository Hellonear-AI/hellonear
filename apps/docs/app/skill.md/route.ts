import { skillMd } from "@/lib/skill";

export const dynamic = "force-static";

export const GET = () => new Response(skillMd(), { headers: { "content-type": "text/markdown; charset=utf-8" } });
