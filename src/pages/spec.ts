import type { APIRoute } from "astro";
import { specContent } from "../lib/spec-sources";

export const GET: APIRoute = () =>
  new Response(specContent(), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
